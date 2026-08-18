import {
  Heartbeat,
  trailingSlash,
} from "@app/heartbeat/heartbeat.constants.ts";
import type { HeartbeatConfig } from "@app/heartbeat/heartbeat.types.ts";
import { FileSystem } from "@effect/platform";
import type { ConfigError } from "effect";
import { Config, Effect, Option } from "effect";

const text = (key: string, fallback: string): Config.Config<string> =>
  Config.string(key).pipe(Config.withDefault(fallback));

const positive = (key: string, fallback: number): Config.Config<number> =>
  Config.integer(key).pipe(
    Config.validate({
      message: `${key} must be a positive number`,
      validation: (value: number): boolean => value > 0,
    }),
    Config.withDefault(fallback),
  );

/** An absent secret is not an error: `/health` is served without a key. */
const readApiKey = (
  path: Option.Option<string>,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem> =>
  Option.match(path, {
    onNone: (): Effect.Effect<Option.Option<string>, never, never> =>
      Effect.succeed(Option.none()),
    onSome: (
      file: string,
    ): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem> =>
      Effect.flatMap(
        FileSystem.FileSystem,
        (fileSystem: FileSystem.FileSystem) => fileSystem.readFileString(file),
      ).pipe(
        Effect.map(
          (content: string): Option.Option<string> =>
            Option.filter(
              Option.some(content.trim()),
              (value: string): boolean => value.length > 0,
            ),
        ),
        Effect.orElseSucceed((): Option.Option<string> => Option.none()),
      ),
  });

/** A misconfigured container fails at startup, with the offending key named. */
const heartbeatConfig: Effect.Effect<
  HeartbeatConfig,
  ConfigError.ConfigError,
  FileSystem.FileSystem
> = Effect.gen(function* () {
  const values: {
    readonly apiKeyFile: Option.Option<string>;
    readonly idleTimeoutSeconds: number;
    readonly keepAliveMs: number;
    readonly port: number;
    readonly probeTimeoutMs: number;
    readonly upstreamUrl: string;
  } = yield* Config.all({
    apiKeyFile: Config.option(Config.string(Heartbeat.keys.apiKeyFile)),
    idleTimeoutSeconds: positive(
      Heartbeat.keys.idleTimeoutSeconds,
      Heartbeat.defaults.idleTimeoutSeconds,
    ),
    keepAliveMs: positive(
      Heartbeat.keys.keepAliveMs,
      Heartbeat.defaults.keepAliveMs,
    ),
    port: positive(Heartbeat.keys.port, Heartbeat.defaults.port),
    probeTimeoutMs: positive(
      Heartbeat.keys.probeTimeoutMs,
      Heartbeat.defaults.probeTimeoutMs,
    ),
    upstreamUrl: text(
      Heartbeat.keys.upstreamUrl,
      Heartbeat.defaults.upstreamUrl,
    ),
  });
  return {
    apiKey: yield* readApiKey(values.apiKeyFile),
    idleTimeoutSeconds: values.idleTimeoutSeconds,
    keepAliveMs: values.keepAliveMs,
    port: values.port,
    probeTimeoutMs: values.probeTimeoutMs,
    upstreamUrl: values.upstreamUrl.replace(trailingSlash, ""),
  };
});

export { heartbeatConfig };
