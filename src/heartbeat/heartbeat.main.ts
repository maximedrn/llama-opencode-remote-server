import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { heartbeatConfig } from "@app/heartbeat/heartbeat.factory.ts";
import { probe, serve } from "@app/heartbeat/heartbeat.service.ts";
import {
  type HeartbeatConfig,
  LlamaDownError,
  type ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import type { ConfigError } from "effect";
import { Effect, Layer, Logger, LogLevel } from "effect";

/** `check` is the Compose healthcheck: one probe through this very process. */
const isCheck: boolean = Bun.argv.includes(Heartbeat.checkArgument);

const selfHealthUrl = (config: HeartbeatConfig): string =>
  `http://127.0.0.1:${config.port}${Heartbeat.paths.health}`;

/**
 * The probe goes through the front, not around it: a failure then means either
 * llama.cpp is down or this process stopped relaying, which are exactly the
 * two reasons Compose should stop sending traffic here.
 */
const runCheck = (
  config: HeartbeatConfig,
): Effect.Effect<void, LlamaDownError> =>
  Effect.gen(function* () {
    const url: string = selfHealthUrl(config);
    const result: ProbeResult = yield* probe(config, url);
    if (result.ok) return;
    return yield* new LlamaDownError({ reason: result.reason, url });
  });

const program: Effect.Effect<
  void,
  ConfigError.ConfigError | LlamaDownError,
  BunContext.BunContext
> = Effect.gen(function* () {
  const config: HeartbeatConfig = yield* heartbeatConfig;
  yield* isCheck ? runCheck(config) : serve(config);
}).pipe(Effect.annotateLogs({ service: Heartbeat.service }));

BunRuntime.runMain(
  program.pipe(
    Effect.tapError(
      (cause: ConfigError.ConfigError | LlamaDownError): Effect.Effect<void> =>
        Effect.logError(String(cause)),
    ),
    Effect.provide(BunContext.layer),
    // One line per event: the pretty console logger is for humans at a TTY,
    // container logs are read by `docker compose logs` and by log shippers.
    Effect.provide(
      Layer.merge(Logger.remove(Logger.prettyLoggerDefault), Logger.logFmt),
    ),
    Logger.withMinimumLogLevel(LogLevel.Info),
  ),
  { disableErrorReporting: true },
);
