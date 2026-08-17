import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import type {
  HeartbeatConfig,
  ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import type { Server } from "bun";
import {
  Duration,
  Effect,
  Option,
  Predicate,
  Runtime,
  Schedule,
  Schema,
  Stream,
} from "effect";

/** The runtime of the fiber that started the server, so the request handlers
 * — plain async functions — log through the same logger and annotations. */
type Host = Runtime.Runtime<never>;

/** A completion asking for a stream is the only one worth holding open. */
const streamRequestSchema = Schema.parseJson(
  Schema.Struct({ stream: Schema.Boolean }),
);

const shorten = (reason: string): string =>
  reason.slice(0, Heartbeat.reasonLength);

const describe = (cause: unknown): string =>
  shorten(Predicate.isError(cause) ? cause.message : String(cause));

const log = (host: Host, effect: Effect.Effect<void>): void => {
  Runtime.runFork(host)(effect);
};

const isStream = (response: Response): boolean =>
  (response.headers.get(Heartbeat.headers.contentType) ?? "").includes(
    Heartbeat.streamContentType,
  );

const wantsStream = (body: string): boolean =>
  Option.match(Schema.decodeUnknownOption(streamRequestSchema)(body), {
    onNone: (): boolean => false,
    onSome: (request: { readonly stream: boolean }): boolean => request.stream,
  });

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
  Stream.repeatValue(new TextEncoder().encode(Heartbeat.keepAliveComment)).pipe(
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

/** Hop-by-hop headers belong to one connection, never to the next one. */
const forwardHeaders = (request: Request): Headers => {
  const headers: Headers = new Headers(request.headers);
  for (const name of Heartbeat.hopByHopHeaders) headers.delete(name);
  return headers;
};

const relayHeaders = (response: Response): Headers => {
  const headers: Headers = new Headers(response.headers);
  if (isStream(response)) {
    headers.set(
      Heartbeat.headers.cacheControl[0],
      Heartbeat.headers.cacheControl[1],
    );
    headers.set(
      Heartbeat.headers.noBuffering[0],
      Heartbeat.headers.noBuffering[1],
    );
  }
  return headers;
};

const streamHeaders = (): Headers => {
  const headers: Headers = new Headers();
  headers.set(Heartbeat.headers.contentType, Heartbeat.streamContentType);
  headers.set(
    Heartbeat.headers.cacheControl[0],
    Heartbeat.headers.cacheControl[1],
  );
  headers.set(
    Heartbeat.headers.noBuffering[0],
    Heartbeat.headers.noBuffering[1],
  );
  return headers;
};

/** The upstream answer, once it finally arrives, as a stream of its bytes. */
const pending = (upstream: Promise<Response>): Stream.Stream<Uint8Array> =>
  Stream.unwrap(
    Effect.promise((): Promise<Response> => upstream).pipe(
      Effect.map(
        (response: Response): Stream.Stream<Uint8Array> =>
          Option.match(Option.fromNullable(response.body), {
            onNone: (): Stream.Stream<Uint8Array> => Stream.empty,
            onSome: bytes,
          }),
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
        method: request.method,
        path: new URL(request.url).pathname,
      }),
    ),
  );
  return new Response(withKeepAlive(host, config, pending(upstream)), {
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
  const upstream: Promise<Response> = fetch(
    `${config.upstreamUrl}${target.pathname}${target.search}`,
    {
      body: body.length > 0 ? body : undefined,
      headers: forwardHeaders(request),
      method: request.method,
      redirect: "manual",
    },
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
      fetch: (request: Request): Promise<Response> =>
        handle(host, config, request),
      idleTimeout: Heartbeat.defaults.idleTimeoutSeconds,
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

export { probe, serve, wantsStream };
