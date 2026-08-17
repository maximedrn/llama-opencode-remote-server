import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import type {
  HeartbeatConfig,
  ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import type { HttpClientResponse } from "@effect/platform";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Duration, Effect, Option, Redacted } from "effect";

const okStatus: number = 200;

const shorten = (reason: string): string =>
  reason.slice(0, Heartbeat.reasonLength);

const authorize = (
  request: HttpClientRequest.HttpClientRequest,
  apiKey: Option.Option<string>,
): HttpClientRequest.HttpClientRequest =>
  Option.match(apiKey, {
    onNone: (): HttpClientRequest.HttpClientRequest => request,
    onSome: (key: string): HttpClientRequest.HttpClientRequest =>
      HttpClientRequest.bearerToken(request, Redacted.make(key)),
  });

/**
 * A probe never fails as an Effect: an unreachable server is the very thing
 * this process reports on, so it is data, not an error.
 */
const probe = (
  config: HeartbeatConfig,
): Effect.Effect<ProbeResult, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client: HttpClient.HttpClient = yield* HttpClient.HttpClient;
    const started: number = Date.now();
    const response: Option.Option<HttpClientResponse.HttpClientResponse> =
      yield* client
        .execute(
          authorize(HttpClientRequest.get(config.healthUrl), config.apiKey),
        )
        .pipe(Effect.timeout(Duration.millis(config.timeoutMs)), Effect.option);
    const latencyMs: number = Date.now() - started;
    return Option.match(response, {
      onNone: (): ProbeResult => ({
        latencyMs,
        ok: false,
        reason: `no answer within ${config.timeoutMs}ms`,
        status: 0,
      }),
      onSome: (answer: HttpClientResponse.HttpClientResponse): ProbeResult => ({
        latencyMs,
        ok: answer.status === okStatus,
        reason: answer.status === okStatus ? "" : `HTTP ${answer.status}`,
        status: answer.status,
      }),
    });
  });

/**
 * Logged once at startup: which llama.cpp build is actually running answers
 * the question an image tag alone never does.
 */
const reportBuild = (
  config: HeartbeatConfig,
): Effect.Effect<void, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client: HttpClient.HttpClient = yield* HttpClient.HttpClient;
    const body: Option.Option<unknown> = yield* client
      .execute(authorize(HttpClientRequest.get(config.propsUrl), config.apiKey))
      .pipe(
        Effect.timeout(Duration.millis(config.timeoutMs)),
        Effect.flatMap(
          (
            response: HttpClientResponse.HttpClientResponse,
          ): Effect.Effect<unknown, unknown> => response.json,
        ),
        Effect.option,
      );
    yield* Option.match(body, {
      onNone: (): Effect.Effect<void> =>
        Effect.logWarning(Heartbeat.messages.propsUnavailable).pipe(
          Effect.annotateLogs({ url: config.propsUrl }),
        ),
      onSome: (properties: unknown): Effect.Effect<void> =>
        Effect.logInfo(Heartbeat.messages.build).pipe(
          Effect.annotateLogs({
            properties: JSON.stringify(properties).slice(
              0,
              Heartbeat.reasonLength,
            ),
          }),
        ),
    });
  });

/** The first probe has no past to compare with: it is reported as-is. */
const logProbe = (
  result: ProbeResult,
  previous: Option.Option<boolean>,
): Effect.Effect<void> => {
  const wasHealthy: boolean = Option.getOrElse(previous, (): boolean => false);
  const isTransition: boolean =
    Option.isNone(previous) || wasHealthy !== result.ok;
  if (result.ok) {
    return (
      isTransition
        ? Effect.logInfo(
            Option.isNone(previous)
              ? Heartbeat.messages.serving
              : Heartbeat.messages.recovered,
          )
        : Effect.logDebug(Heartbeat.messages.serving)
    ).pipe(Effect.annotateLogs({ latencyMs: result.latencyMs }));
  }
  const annotations: { readonly latencyMs: number; readonly reason: string } = {
    latencyMs: result.latencyMs,
    reason: shorten(result.reason),
  };
  return (
    isTransition
      ? Effect.logError(Heartbeat.messages.degraded)
      : Effect.logWarning(Heartbeat.messages.probeFailed)
  ).pipe(Effect.annotateLogs(annotations));
};

/**
 * Steady state is quiet: every probe is logged at debug, and only the
 * transitions between healthy and unhealthy are raised to info and error.
 */
const watch = (
  config: HeartbeatConfig,
): Effect.Effect<never, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(Heartbeat.messages.started).pipe(
      Effect.annotateLogs({
        intervalMs: config.intervalMs,
        timeoutMs: config.timeoutMs,
        url: config.healthUrl,
      }),
    );
    yield* reportBuild(config);
    let healthy: Option.Option<boolean> = Option.none();
    while (true) {
      const result: ProbeResult = yield* probe(config);
      yield* logProbe(result, healthy);
      healthy = Option.some(result.ok);
      yield* Effect.sleep(Duration.millis(config.intervalMs));
    }
  });

export { probe, watch };
