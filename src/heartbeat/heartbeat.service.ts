import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import type {
  HeartbeatConfig,
  Host,
  ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import {
  describe,
  encode,
  isStream,
  relayHeaders,
  shorten,
  streamHeaders,
  upstreamRequest,
  wantsStream,
} from "@app/heartbeat/heartbeat.utils.ts";
import type { Server } from "bun";
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
 * The answer, once it finally arrives. A rejected upstream cannot become a
 * status code any more — the SSE answer was committed minutes ago — so it is
 * logged and told to the client inside the stream it is already reading,
 * instead of escaping as an unhandled rejection.
 */
const pending = (
  host: Host,
  upstream: Promise<Response>,
): Stream.Stream<Uint8Array> =>
  Stream.unwrap(
    Effect.tryPromise({
      catch: (cause: unknown): string => describe(cause),
      try: (): Promise<Response> => upstream,
    }).pipe(
      Effect.map(
        (response: Response): Stream.Stream<Uint8Array> =>
          Option.match(Option.fromNullable(response.body), {
            onNone: (): Stream.Stream<Uint8Array> => Stream.empty,
            onSome: bytes,
          }),
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
  upstream: Promise<Response>,
): Response => {
  log(
    host,
    Effect.logInfo(Heartbeat.messages.committed).pipe(
      Effect.annotateLogs({
        asked: true,
        method: request.method,
        path: new URL(request.url).pathname,
      }),
    ),
  );
  return new Response(withKeepAlive(host, config, pending(host, upstream)), {
    headers: streamHeaders(),
    status: Heartbeat.upstreamStatus.ok,
  });
};

const answer = (
  host: Host,
  config: HeartbeatConfig,
  response: Response,
): Response =>
  Option.match(Option.fromNullable(response.body), {
    onNone: (): Response => response,
    onSome: (body: ReadableStream<Uint8Array>): Response =>
      new Response(
        isStream(response) ? withKeepAlive(host, config, bytes(body)) : body,
        { headers: relayHeaders(response), status: response.status },
      ),
  });

/** Everything is relayed untouched; only a streaming body is kept warm. */
const relay = async (
  host: Host,
  config: HeartbeatConfig,
  request: Request,
): Promise<Response> => {
  const target: URL = new URL(request.url);
  const started: number = Date.now();
  const body: string = await request.text();
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
  if (Option.isNone(early) && wantsStream(body)) {
    return commit(host, config, request, upstream);
  }
  const response: Response = await upstream;
  log(
    host,
    Effect.logInfo(Heartbeat.messages.proxied).pipe(
      Effect.annotateLogs({
        // `asked` is what the client requested, `stream` what llama.cpp
        // answered with: a long request that asked for neither is the one
        // nothing can keep alive.
        asked: wantsStream(body),
        bytes: body.length,
        latencyMs: Date.now() - started,
        method: request.method,
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

const authorization = (config: HeartbeatConfig): Record<string, string> =>
  Option.match(config.apiKey, {
    onNone: (): Record<string, string> => ({}),
    onSome: (key: string): Record<string, string> => ({
      Authorization: `Bearer ${key}`,
    }),
  });

/** One probe; it never fails, because a dead server is the answer itself. */
const probe = (
  config: HeartbeatConfig,
  url: string,
): Effect.Effect<ProbeResult> =>
  Effect.gen(function* () {
    const started: number = Date.now();
    const status: Option.Option<number> = yield* Effect.tryPromise(
      async (): Promise<number> => {
        const response: Response = await fetch(url, {
          headers: authorization(config),
          signal: AbortSignal.timeout(config.probeTimeoutMs),
        });
        return response.status;
      },
    ).pipe(Effect.option);
    return Option.match(status, {
      onNone: (): ProbeResult => ({
        latencyMs: Date.now() - started,
        ok: false,
        reason: `no answer within ${config.probeTimeoutMs}ms`,
      }),
      onSome: (answered: number): ProbeResult => ({
        latencyMs: Date.now() - started,
        ok: answered === Heartbeat.upstreamStatus.ok,
        reason: `HTTP ${answered}`,
      }),
    });
  });

/**
 * Logged once at startup: which llama.cpp build is actually running answers
 * the question an image tag alone never does.
 */
const reportBuild = (config: HeartbeatConfig): Effect.Effect<void> =>
  Effect.tryPromise(async (): Promise<unknown> => {
    const response: Response = await fetch(
      `${config.upstreamUrl}${Heartbeat.paths.props}`,
      {
        headers: authorization(config),
        signal: AbortSignal.timeout(config.probeTimeoutMs),
      },
    );
    return await response.json();
  }).pipe(
    Effect.flatMap(
      (properties: unknown): Effect.Effect<void> =>
        Effect.logInfo(Heartbeat.messages.build).pipe(
          Effect.annotateLogs({
            properties: shorten(JSON.stringify(properties)),
          }),
        ),
    ),
    Effect.orElse(
      (): Effect.Effect<void> =>
        Effect.logWarning(Heartbeat.messages.propsUnavailable),
    ),
  );

/** Serves until the container stops; the fiber never completes on its own. */
const serve = (config: HeartbeatConfig): Effect.Effect<never> =>
  Effect.gen(function* () {
    const host: Host = yield* Effect.runtime<never>();
    const server: Server<unknown> = Bun.serve({
      fetch: (request: Request, self: Server<unknown>): Promise<Response> => {
        // A relayed request has no deadline of its own: llama.cpp decides when
        // it is done, and a peer that hangs up is what makes it give up
        // (`should_stop`). Bun closes an idle connection on its own, so every
        // relayed request opts out of that timer.
        self.timeout(request, Heartbeat.noRequestTimeout);
        return handle(host, config, request);
      },
      idleTimeout: config.idleTimeoutSeconds,
      port: config.port,
    });
    yield* Effect.logInfo(Heartbeat.messages.listening).pipe(
      Effect.annotateLogs({
        keepAliveMs: config.keepAliveMs,
        port: server.port,
        upstream: config.upstreamUrl,
      }),
    );
    yield* reportBuild(config);
    return yield* Effect.never;
  });

export { probe, serve };
