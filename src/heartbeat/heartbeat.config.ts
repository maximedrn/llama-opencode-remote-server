import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import type { HeartbeatConfig } from "@app/heartbeat/heartbeat.types.ts";
import { FileSystem } from "@effect/platform";
import type { ConfigError } from "effect";
import { Config, Effect, Option } from "effect";

const text = (key: string, fallback: string): Config.Config<string> =>
  Config.string(key).pipe(Config.withDefault(fallback));

const positive = (key: string, fallback: number): Config.Config<number> =>
  Config.integer(key).pipe(
    Config.validate({
      message: `${key} must be a positive number of milliseconds`,
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
    readonly healthUrl: string;
    readonly intervalMs: number;
    readonly propsUrl: string;
    readonly timeoutMs: number;
  } = yield* Config.all({
    apiKeyFile: Config.option(Config.string(Heartbeat.keys.apiKeyFile)),
    healthUrl: text(Heartbeat.keys.healthUrl, Heartbeat.defaults.healthUrl),
    intervalMs: positive(
      Heartbeat.keys.intervalMs,
      Heartbeat.defaults.intervalMs,
    ),
    propsUrl: text(Heartbeat.keys.propsUrl, Heartbeat.defaults.propsUrl),
    timeoutMs: positive(Heartbeat.keys.timeoutMs, Heartbeat.defaults.timeoutMs),
  });
  return {
    apiKey: yield* readApiKey(values.apiKeyFile),
    healthUrl: values.healthUrl,
    intervalMs: values.intervalMs,
    propsUrl: values.propsUrl,
    timeoutMs: values.timeoutMs,
  };
});

export { heartbeatConfig };
