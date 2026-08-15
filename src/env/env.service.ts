import { ClientFile, EnvFile } from "@app/env/env.constants.ts";
import type { EnvApi } from "@app/env/env.interface.ts";
import {
  type ClientEnv,
  EnvNotInitializedError,
  type EnvRecord,
  type ModelLocation,
  type StackEnv,
} from "@app/env/env.types.ts";
import { FileSystem, PlatformConfigProvider } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Config, ConfigProvider, Effect, Option } from "effect";
import { stringify } from "envfile";

const optionalString = (name: string): Config.Config<Option.Option<string>> =>
  Config.option(Config.string(name));

const isFilled = (value: string): boolean => value.trim().length > 0;

/**
 * `KEY=""` means absent, not empty: both example files ship keys blank, and an
 * empty value would otherwise reach Compose or the smoke test as a real one.
 */
const withoutBlanks = <A extends Record<string, Option.Option<string>>>(
  values: A,
): A =>
  Object.fromEntries(
    Object.entries(values).map(
      (
        entry: [string, Option.Option<string>],
      ): [string, Option.Option<string>] => [
        entry[0],
        Option.filter(entry[1], isFilled),
      ],
    ),
  ) as A;

/** Everything `.env` may hold, described once as a single `Config`. */
const stackEnvConfig: Config.Config<StackEnv> = Config.all({
  backend: optionalString(EnvFile.keys.backend),
  localPort: optionalString(EnvFile.keys.localPort),
  modelAlias: optionalString(EnvFile.keys.modelAlias),
  modelDirectory: optionalString(EnvFile.keys.modelDirectory),
  modelFile: optionalString(EnvFile.keys.modelFile),
}).pipe(Config.map(withoutBlanks));

const clientEnvConfig: Config.Config<ClientEnv> = Config.all({
  accessClientId: optionalString(ClientFile.keys.accessClientId),
  accessClientSecret: optionalString(ClientFile.keys.accessClientSecret),
  apiKey: optionalString(ClientFile.keys.apiKey),
  baseUrl: optionalString(ClientFile.keys.baseUrl),
}).pipe(Config.map(withoutBlanks));

const missingKeys = (env: StackEnv): readonly string[] =>
  [
    Option.isNone(env.modelDirectory) ? EnvFile.keys.modelDirectory : "",
    Option.isNone(env.modelFile) ? EnvFile.keys.modelFile : "",
  ].filter((key: string): boolean => key.length > 0);

class EnvService extends Effect.Service<EnvService>()("EnvService", {
  effect: Effect.gen(function* () {
    const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;

    /** An absent file is not an error: the caller decides what it needs. */
    const provider = (
      path: string,
    ): Effect.Effect<ConfigProvider.ConfigProvider, PlatformError> =>
      fileSystem
        .exists(path)
        .pipe(
          Effect.flatMap(
            (
              exists: boolean,
            ): Effect.Effect<ConfigProvider.ConfigProvider, PlatformError> =>
              exists
                ? PlatformConfigProvider.fromDotEnv(path).pipe(
                    Effect.provideService(FileSystem.FileSystem, fileSystem),
                  )
                : Effect.succeed(ConfigProvider.fromMap(new Map())),
          ),
        );

    const readFile = <A>(
      path: string,
      config: Config.Config<A>,
    ): Effect.Effect<A, PlatformError> =>
      provider(path).pipe(
        Effect.flatMap(
          (source: ConfigProvider.ConfigProvider): Effect.Effect<A> =>
            Effect.withConfigProvider(Effect.orDie(config), source),
        ),
      );

    const read: Effect.Effect<StackEnv, PlatformError> = readFile(
      EnvFile.path,
      stackEnvConfig,
    );

    const readClient: Effect.Effect<ClientEnv, PlatformError> = readFile(
      ClientFile.path,
      clientEnvConfig,
    );

    const requireModel: Effect.Effect<
      ModelLocation,
      EnvNotInitializedError | PlatformError
    > = read.pipe(
      Effect.flatMap(
        (env: StackEnv): Effect.Effect<ModelLocation, EnvNotInitializedError> =>
          Option.match(Option.all([env.modelDirectory, env.modelFile]), {
            onNone: (): EnvNotInitializedError =>
              new EnvNotInitializedError({
                missing: missingKeys(env).join(", "),
              }),
            onSome: (
              found: readonly [string, string],
            ): Effect.Effect<ModelLocation> =>
              Effect.succeed({ directory: found[0], file: found[1] }),
          }),
      ),
    );

    const write = (values: EnvRecord): Effect.Effect<void, PlatformError> =>
      fileSystem.writeFileString(EnvFile.path, stringify(values));

    const api: EnvApi = { read, readClient, requireModel, write };
    return api;
  }),
}) {}

export { EnvService };
