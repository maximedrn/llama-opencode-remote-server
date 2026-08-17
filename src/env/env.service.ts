import { ClientFile, EnvFile } from "@app/env/env.constants.ts";
import type { EnvApi } from "@app/env/env.interface.ts";
import {
  type ClientEnv,
  EnvNotInitializedError,
  EnvReadError,
  type EnvRecord,
  type ModelLocation,
  type StackEnv,
} from "@app/env/env.types.ts";
import {
  clientEnvConfig,
  missingKeys,
  stackEnvConfig,
} from "@app/env/env.utils.ts";
import { FileSystem, PlatformConfigProvider } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { Config } from "effect";
import { ConfigProvider, Effect, Option } from "effect";
import { stringify } from "envfile";

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
    ): Effect.Effect<A, EnvReadError | PlatformError> =>
      provider(path).pipe(
        Effect.flatMap(
          (
            source: ConfigProvider.ConfigProvider,
          ): Effect.Effect<A, EnvReadError> =>
            Effect.withConfigProvider(config, source).pipe(
              Effect.mapError(
                (cause: unknown): EnvReadError =>
                  new EnvReadError({ file: path, reason: String(cause) }),
              ),
            ),
        ),
      );

    const read: Effect.Effect<StackEnv, EnvReadError | PlatformError> =
      readFile(EnvFile.path, stackEnvConfig);

    const readClient: Effect.Effect<ClientEnv, EnvReadError | PlatformError> =
      readFile(ClientFile.path, clientEnvConfig);

    const requireModel: Effect.Effect<
      ModelLocation,
      EnvNotInitializedError | EnvReadError | PlatformError
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
