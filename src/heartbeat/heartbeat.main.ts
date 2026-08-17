import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { heartbeatConfig } from "@app/heartbeat/heartbeat.factory.ts";
import { probe, watch } from "@app/heartbeat/heartbeat.service.ts";
import {
  type HeartbeatConfig,
  LlamaDownError,
  type ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import { FetchHttpClient, type HttpClient } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import type { ConfigError } from "effect";
import { Effect, Layer, Logger, LogLevel } from "effect";

const runtimeLayer: Layer.Layer<BunContext.BunContext | HttpClient.HttpClient> =
  Layer.mergeAll(BunContext.layer, FetchHttpClient.layer);

/** `check` is the Compose healthcheck: one probe, then an exit code. */
const isCheck: boolean = Bun.argv.includes(Heartbeat.checkArgument);

const runCheck = (
  config: HeartbeatConfig,
): Effect.Effect<void, LlamaDownError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const result: ProbeResult = yield* probe(config);
    if (result.ok) return;
    return yield* new LlamaDownError({
      reason: result.reason,
      url: config.healthUrl,
    });
  });

/**
 * A failed probe leaves through the error channel, so the runtime exits
 * non-zero and Docker sees the container as unhealthy.
 */
const program: Effect.Effect<
  void,
  ConfigError.ConfigError | LlamaDownError,
  BunContext.BunContext | HttpClient.HttpClient
> = Effect.gen(function* () {
  const config: HeartbeatConfig = yield* heartbeatConfig;
  yield* isCheck ? runCheck(config) : watch(config);
}).pipe(Effect.annotateLogs({ service: Heartbeat.service }));

BunRuntime.runMain(
  program.pipe(
    Effect.tapError((cause: ConfigError.ConfigError | LlamaDownError) =>
      Effect.logError(String(cause)),
    ),
    Effect.provide(runtimeLayer),
    // One line per event: the pretty console logger is for humans at a TTY,
    // container logs are read by `docker compose logs` and by log shippers.
    Effect.provide(
      Layer.merge(Logger.remove(Logger.prettyLoggerDefault), Logger.logFmt),
    ),
    Logger.withMinimumLogLevel(LogLevel.Info),
  ),
  { disableErrorReporting: true },
);
