import { ClientFile, EnvFile } from "@app/cli/resource/env/env.constants.ts";
import { readFile, readRawFile } from "@app/cli/resource/env/env.helpers.ts";
import type { EnvApi } from "@app/cli/resource/env/env.interface.ts";
import {
  type ClientEnv,
  EnvNotInitializedError,
  type EnvReadError,
  type ModelLocation,
  type StackEnv,
} from "@app/cli/resource/env/env.types.ts";
import {
  clientEnvConfig,
  missingKeys,
  stackEnvConfig,
} from "@app/cli/resource/env/env.utils.ts";
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Option } from "effect";

class EnvService extends Effect.Service<EnvService>()("EnvService", {
  effect: Effect.gen(function* () {
    const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;

    const read: Effect.Effect<StackEnv, EnvReadError | PlatformError> =
      readFile(fileSystem, EnvFile.path, stackEnvConfig);

    const readClient: Effect.Effect<ClientEnv, EnvReadError | PlatformError> =
      readFile(fileSystem, ClientFile.path, clientEnvConfig);

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

    const api: EnvApi = {
      read,
      readClient,
      readRaw: readRawFile(fileSystem),
      requireModel,
    };
    return api;
  }),
}) {}

export { EnvService };
