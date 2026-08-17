import type { ModelLocation } from "@app/env/env.types.ts";
import { Model } from "@app/model/model.constants.ts";
import { servedModels } from "@app/stack/client.ts";
import type {
  ListModelsError,
  StackDependencies,
} from "@app/stack/stack.interface.ts";
import type { ModelListing } from "@app/stack/stack.types.ts";
import type { File } from "@effect/platform/FileSystem";
import { Effect, Option } from "effect";

/** Model files anywhere under the directory `.env` points at. */
const scan = (directory: string): Effect.Effect<readonly string[]> =>
  Effect.tryPromise(
    (): Promise<string[]> =>
      Array.fromAsync(
        new Bun.Glob(Model.searchPattern(`*${Model.extension}`)).scan({
          cwd: directory,
          onlyFiles: true,
        }),
      ),
  ).pipe(Effect.orElseSucceed((): readonly string[] => []));

const describe = (
  dependencies: StackDependencies,
  directory: string,
  file: string,
): Effect.Effect<ModelListing> =>
  dependencies.fileSystem.stat(dependencies.path.join(directory, file)).pipe(
    Effect.map(
      (info: File.Info): ModelListing => ({
        name: file,
        size: Option.some(Number(info.size)),
      }),
    ),
    Effect.orElseSucceed(
      (): ModelListing => ({ name: file, size: Option.none() }),
    ),
  );

const localModels = (
  dependencies: StackDependencies,
): Effect.Effect<readonly ModelListing[], ListModelsError> =>
  Effect.gen(function* () {
    const location: ModelLocation = yield* dependencies.env.requireModel;
    const files: readonly string[] = yield* scan(location.directory);
    return yield* Effect.forEach(files, (file: string) =>
      describe(dependencies, location.directory, file),
    );
  });

/**
 * A server host lists the files it can mount; a client host has none of them,
 * so it falls back to whatever the endpoint in `client.env` says it serves.
 */
const listModels = (
  dependencies: StackDependencies,
): Effect.Effect<readonly ModelListing[], ListModelsError> =>
  localModels(dependencies).pipe(
    Effect.flatMap(
      (
        models: readonly ModelListing[],
      ): Effect.Effect<readonly ModelListing[], ListModelsError> =>
        models.length > 0 ? Effect.succeed(models) : servedModels(dependencies),
    ),
    Effect.catchTag(
      "EnvNotInitializedError",
      (): Effect.Effect<readonly ModelListing[], ListModelsError> =>
        servedModels(dependencies),
    ),
  );

export { listModels, localModels };
