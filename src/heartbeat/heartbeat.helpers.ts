import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import type {
  HeartbeatConfig,
  Host,
  RequestSummary,
} from "@app/heartbeat/heartbeat.types.ts";
import {
  describe,
  encode,
  isStream,
  relayHeaders,
  shorten,
  streamHeaders,
  summarize,
  tail,
  upstreamRequest,
} from "@app/heartbeat/heartbeat.utils.ts";
import { Duration, Effect, Option, Runtime, Schedule, Stream } from "effect";

const log = (host: Host, effect: Effect.Effect<void>): void => {
  Runtime.runFork(host)(effect);
};

const bytes = (source: ReadableStream<Uint8Array>): Stream.Stream<Uint8Array> =>
  Stream.fromReadableStream({
    evaluate: (): ReadableStream<Uint8Array> => source,
    onError: (): never => {
      throw new Error(Heartbeat.messages.upstreamFailed);
    },
  });

/**
 * The whole point of this process: while llama.cpp says nothing — it is busy
 * processing a long prompt — an SSE comment goes out on a fixed beat, so the
 * tunnel, the proxy and the client SDK all keep the connection open.
 */
const comments = (config: HeartbeatConfig): Stream.Stream<Uint8Array> =>
  Stream.repeatValue(encode(Heartbeat.keepAliveComment)).pipe(
    Stream.schedule(Schedule.spaced(Duration.millis(config.keepAliveMs))),
    Stream.tap(
      (): Effect.Effect<void> => Effect.logDebug(Heartbeat.messages.keepAlive),
    ),
  );

/**
 * The answer, with the beat merged in. `haltStrategy: "left"` is what ends it:
 * the comments stop as soon as llama.cpp has said everything it had to say.
 */
const withKeepAlive = (
  host: Host,
  config: HeartbeatConfig,
  spoken: Stream.Stream<Uint8Array>,
): ReadableStream<Uint8Array> =>
  Runtime.runSync(host)(
    Stream.toReadableStreamEffect(
      Stream.merge(spoken, comments(config), { haltStrategy: "left" }),
    ),
  );

/**
 * The answer was committed as a stream, and llama.cpp replied with something
 * else — a rejected model, a refused `tools` + `stream` combination. Piping
 * that JSON into the stream leaves the client waiting for a frame that never
 * comes, so it is turned into the one frame every client understands.
 */
const notStreamed = (
  host: Host,
  response: Response,
): Effect.Effect<Stream.Stream<Uint8Array>> =>
  Effect.promise((): Promise<string> => response.text()).pipe(
    Effect.catchAllDefect((): Effect.Effect<string> => Effect.succeed("")),
    Effect.map((body: string): Stream.Stream<Uint8Array> => {
      const reason: string = Heartbeat.messages.notStreamed(
        response.status,
        shorten(body),
      );
      log(host, Effect.logError(reason));
      return Stream.make(encode(Heartbeat.streamError(reason)));
    }),
  );

/**
 * The answer, once it finally arrives. A rejected upstream cannot become a
 * status code any more — the SSE answer was committed minutes ago — so it is
 * logged and told to the client inside the stream it is already reading,
 * instead of escaping as an unhandled rejection.
 */
const pending = (
  host: Host,
  config: HeartbeatConfig,
  upstream: Promise<Response>,
): Stream.Stream<Uint8Array> =>
  Stream.unwrap(
    Effect.tryPromise({
      catch: (cause: unknown): string => describe(cause),
      try: (): Promise<Response> => upstream,
    }).pipe(
      Effect.flatMap(
        (response: Response): Effect.Effect<Stream.Stream<Uint8Array>> => {
          if (config.trace) traceAnswer(host, response);
          return isStream(response)
            ? Effect.succeed(
                Option.match(Option.fromNullable(response.body), {
                  onNone: (): Stream.Stream<Uint8Array> => Stream.empty,
                  onSome: bytes,
                }),
              )
            : notStreamed(host, response);
        },
      ),
      Effect.catchAll(
        (reason: string): Effect.Effect<Stream.Stream<Uint8Array>> => {
          log(
            host,
            Effect.logError(Heartbeat.messages.upstreamFailed).pipe(
              Effect.annotateLogs({ reason }),
            ),
          );
          return Effect.succeed(
            Stream.make(encode(Heartbeat.streamError(reason))),
          );
        },
      ),
    ),
  );

/**
 * llama.cpp does not flush the response head until it has something to say, so
 * a stalled request cannot be recognised from the answer: the front commits to
 * the SSE answer itself, beats while it waits, and pipes the real body in as
 * soon as it arrives.
 */
const commit = (
  host: Host,
  config: HeartbeatConfig,
  request: Request,
  summary: RequestSummary,
  upstream: Promise<Response>,
): Response => {
  log(
    host,
    Effect.logInfo(Heartbeat.messages.committed).pipe(
      Effect.annotateLogs({
        asked: true,
        method: request.method,
        model: summary.model,
        path: new URL(request.url).pathname,
      }),
    ),
  );
  return new Response(
    withKeepAlive(host, config, pending(host, config, upstream)),
    {
      headers: streamHeaders(),
      status: Heartbeat.upstreamStatus.ok,
    },
  );
};

/** A copy of the answer is read aside, so the client still gets it whole. */
const traceAnswer = (host: Host, response: Response): void => {
  log(
    host,
    Effect.promise((): Promise<string> => response.clone().text()).pipe(
      Effect.flatMap(
        (body: string): Effect.Effect<void> =>
          Effect.logInfo(Heartbeat.messages.traceAnswer).pipe(
            Effect.annotateLogs({ body: tail(body), status: response.status }),
          ),
      ),
      Effect.catchAllDefect((): Effect.Effect<void> => Effect.void),
    ),
  );
};

const answer = (
  host: Host,
  config: HeartbeatConfig,
  response: Response,
): Response => {
  if (config.trace) traceAnswer(host, response);
  return Option.match(Option.fromNullable(response.body), {
    onNone: (): Response => response,
    onSome: (body: ReadableStream<Uint8Array>): Response =>
      new Response(
        isStream(response) ? withKeepAlive(host, config, bytes(body)) : body,
        { headers: relayHeaders(response), status: response.status },
      ),
  });
};

/** Everything is relayed untouched; only a streaming body is kept warm. */
const relay = async (
  host: Host,
  config: HeartbeatConfig,
  request: Request,
): Promise<Response> => {
  const target: URL = new URL(request.url);
  const started: number = Date.now();
  const body: string = await request.text();
  const summary: RequestSummary = summarize(body);
  if (config.trace) {
    log(
      host,
      Effect.logInfo(Heartbeat.messages.traceRequest).pipe(
        Effect.annotateLogs({ body: tail(body), path: target.pathname }),
      ),
    );
  }
  // Which side hung up is the whole question when a long request dies: this
  // line is logged when it is the client, and `upstreamFailed` when it is
  // llama.cpp. Forwarding the signal also frees the slot instead of letting
  // llama.cpp generate for nobody.
  request.signal.addEventListener(
    "abort",
    (): void => {
      log(
        host,
        Effect.logWarning(Heartbeat.messages.clientGone).pipe(
          Effect.annotateLogs({
            elapsedMs: Date.now() - started,
            path: target.pathname,
          }),
        ),
      );
    },
    { once: true },
  );
  const upstream: Promise<Response> = fetch(
    `${config.upstreamUrl}${target.pathname}${target.search}`,
    upstreamRequest(request, body),
  );
  const early: Option.Option<Response> = Option.fromNullable(
    await Promise.race([
      upstream,
      Bun.sleep(config.keepAliveMs).then((): undefined => undefined),
    ]),
  );
  if (Option.isNone(early) && summary.asked) {
    return commit(host, config, request, summary, upstream);
  }
  const response: Response = await upstream;
  log(
    host,
    Effect.logInfo(Heartbeat.messages.proxied).pipe(
      Effect.annotateLogs({
        // `asked` is what the client requested, `stream` what llama.cpp
        // answered with: a long request that asked for neither is the one
        // nothing can keep alive.
        asked: summary.asked,
        bytes: body.length,
        latencyMs: Date.now() - started,
        method: request.method,
        model: summary.model,
        path: target.pathname,
        status: response.status,
        stream: isStream(response),
      }),
    ),
  );
  return answer(host, config, response);
};

/** A refused upstream is answered, and logged, as a plain bad gateway. */
const handle = (
  host: Host,
  config: HeartbeatConfig,
  request: Request,
): Promise<Response> =>
  relay(host, config, request).catch((cause: unknown): Response => {
    log(
      host,
      Effect.logError(Heartbeat.messages.upstreamFailed).pipe(
        Effect.annotateLogs({ reason: describe(cause) }),
      ),
    );
    return new Response(describe(cause), {
      status: Heartbeat.upstreamStatus.badGateway,
    });
  });

export { handle, log };
