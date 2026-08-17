import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import type {
  HeartbeatConfig,
  ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import type { Server } from "bun";
import { Effect, Option, Runtime } from "effect";

/** What `reader.read()` resolves to; the DOM types name it awkwardly. */
type ReadChunk =
  | { readonly done: false; readonly value: Uint8Array }
  | { readonly done: true; readonly value?: undefined };

/** Logs from inside the request handler, which is plain async by nature. */
type Log = (effect: Effect.Effect<void>) => void;

const shorten = (reason: string): string =>
  reason.slice(0, Heartbeat.reasonLength);

const describe = (cause: unknown): string =>
  shorten(cause instanceof Error ? cause.message : String(cause));

const isStream = (response: Response): boolean =>
  (response.headers.get(Heartbeat.headers.contentType) ?? "").includes(
    Heartbeat.streamContentType,
  );

/**
 * The whole point of this process: while llama.cpp says nothing — it is busy
 * processing a long prompt — an SSE comment goes out every `keepAliveMs`, so
 * the tunnel, the proxy and the client SDK all keep the connection open.
 */
const keepAliveStream = (
  source: ReadableStream<Uint8Array>,
  config: HeartbeatConfig,
  log: Log,
): ReadableStream<Uint8Array> => {
  const comment: Uint8Array = new TextEncoder().encode(
    Heartbeat.keepAliveComment,
  );
  const reader: ReadableStreamDefaultReader<Uint8Array> = source.getReader();
  let timer: Timer | undefined;
  return new ReadableStream<Uint8Array>({
    cancel: (reason: unknown): Promise<void> => {
      clearInterval(timer);
      return reader.cancel(reason);
    },
    start: (controller: ReadableStreamDefaultController<Uint8Array>): void => {
      timer = setInterval((): void => {
        controller.enqueue(comment);
        log(Effect.logDebug(Heartbeat.messages.keepAlive));
      }, config.keepAliveMs);
      const pump = async (): Promise<void> => {
        for (;;) {
          // biome-ignore lint/performance/noAwaitInLoops: draining a stream is sequential by definition.
          const chunk: ReadChunk = await reader.read();
          if (chunk.done) break;
          if (Option.isSome(Option.fromNullable(chunk.value))) {
            controller.enqueue(chunk.value);
          }
        }
      };
      pump()
        .then((): void => {
          controller.close();
        })
        .catch((cause: unknown): void => {
          controller.error(cause);
        })
        .finally((): void => {
          clearInterval(timer);
        });
    },
  });
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

/** Hop-by-hop headers belong to one connection, never to the next one. */
const forwardHeaders = (request: Request): Headers => {
  const headers: Headers = new Headers(request.headers);
  for (const name of Heartbeat.hopByHopHeaders) headers.delete(name);
  return headers;
};

/** Only a completion asking for a stream can be held open with comments. */
const wantsStream = (body: string): boolean =>
  Option.match(
    Option.liftThrowable((value: string): unknown => JSON.parse(value))(body),
    {
      onNone: (): boolean => false,
      onSome: (parsed: unknown): boolean =>
        typeof parsed === "object" &&
        Option.isSome(Option.fromNullable(parsed)) &&
        (parsed as Record<string, unknown>)[Heartbeat.streamField] === true,
    },
  );

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

/**
 * llama.cpp does not flush the response head until it has something to say, so
 * a stalled request cannot be recognised from the answer: the front commits to
 * the SSE answer itself, writes comments while it waits, and pipes the real
 * body in as soon as it arrives.
 */
const committedStream = (
  config: HeartbeatConfig,
  upstream: Promise<Response>,
  log: Log,
): ReadableStream<Uint8Array> => {
  const comment: Uint8Array = new TextEncoder().encode(
    Heartbeat.keepAliveComment,
  );
  let timer: Timer | undefined;
  return new ReadableStream<Uint8Array>({
    start: (controller: ReadableStreamDefaultController<Uint8Array>): void => {
      timer = setInterval((): void => {
        controller.enqueue(comment);
        log(Effect.logDebug(Heartbeat.messages.keepAlive));
      }, config.keepAliveMs);
      upstream
        .then(async (response: Response): Promise<void> => {
          clearInterval(timer);
          const body: Option.Option<ReadableStream<Uint8Array>> =
            Option.fromNullable(response.body);
          if (Option.isNone(body)) return;
          const reader: ReadableStreamDefaultReader<Uint8Array> =
            body.value.getReader();
          for (;;) {
            // biome-ignore lint/performance/noAwaitInLoops: draining a stream is sequential by definition.
            const chunk: ReadChunk = await reader.read();
            if (chunk.done) break;
            if (Option.isSome(Option.fromNullable(chunk.value))) {
              controller.enqueue(chunk.value);
            }
          }
        })
        .then((): void => {
          controller.close();
        })
        .catch((cause: unknown): void => {
          controller.error(cause);
        })
        .finally((): void => {
          clearInterval(timer);
        });
    },
  });
};

/** Everything is relayed untouched; only a streaming body is wrapped. */
const relay = async (
  config: HeartbeatConfig,
  request: Request,
  log: Log,
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
  const answered: Response | undefined = await Promise.race([
    upstream,
    Bun.sleep(config.keepAliveMs).then((): undefined => undefined),
  ]);
  if (Option.isNone(Option.fromNullable(answered)) && wantsStream(body)) {
    log(
      Effect.logInfo(Heartbeat.messages.committed).pipe(
        Effect.annotateLogs({ method: request.method, path: target.pathname }),
      ),
    );
    return new Response(committedStream(config, upstream, log), {
      headers: streamHeaders(),
      status: Heartbeat.upstreamStatus.ok,
    });
  }
  const response: Response = answered ?? (await upstream);
  log(
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
  return Option.match(Option.fromNullable(response.body), {
    onNone: (): Response => response,
    onSome: (answerBody: ReadableStream<Uint8Array>): Response =>
      new Response(
        isStream(response)
          ? keepAliveStream(answerBody, config, log)
          : answerBody,
        { headers: relayHeaders(response), status: response.status },
      ),
  });
};

/** A refused upstream is answered, and logged, as a plain bad gateway. */
const handle = (
  config: HeartbeatConfig,
  request: Request,
  log: Log,
): Promise<Response> =>
  relay(config, request, log).catch((cause: unknown): Response => {
    log(
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
    const runtime: Runtime.Runtime<never> = yield* Effect.runtime<never>();
    const log: Log = (effect: Effect.Effect<void>): void => {
      Runtime.runFork(runtime)(effect);
    };
    const server: Server<unknown> = Bun.serve({
      fetch: (request: Request): Promise<Response> =>
        handle(config, request, log),
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

export { keepAliveStream, probe, serve };
