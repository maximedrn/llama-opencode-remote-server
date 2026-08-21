import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { handle } from "@app/heartbeat/heartbeat.helpers.ts";
import type {
  HeartbeatConfig,
  Host,
  ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import { shorten } from "@app/heartbeat/heartbeat.utils.ts";
import type { Server } from "bun";
import { Effect, Option } from "effect";

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
