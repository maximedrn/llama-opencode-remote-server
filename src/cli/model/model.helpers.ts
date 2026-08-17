import { Model } from "@app/cli/model/model.constants.ts";
import type { ModelResolutionError } from "@app/cli/model/model.interface.ts";
import {
  type DownloadUrlSource,
  HuggingFaceCliMissingError,
  type HuggingFaceSource,
  type LocalFileSource,
  ModelDownloadError,
  ModelFileMissingError,
  type ModelListing,
  ModelNotFoundError,
  type ModelRequest,
  type ResolvedModel,
} from "@app/cli/model/model.types.ts";
import { fileNameFromUrl, toPosixPath } from "@app/cli/model/model.utils.ts";
import type { ProcessApi } from "@app/cli/process/process.interface.ts";
import type { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { File } from "@effect/platform/FileSystem";
import { Console, Effect, Option } from "effect";

interface ModelDependencies {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly processes: ProcessApi;
}

/** Every file matching the glob anywhere under the directory, sorted. */
const scanFiles = (
  directory: string,
  pattern: string,
): Effect.Effect<readonly string[]> =>
  Effect.tryPromise(
    (): Promise<string[]> =>
      Array.fromAsync(
        new Bun.Glob(Model.searchPattern(pattern)).scan({
          cwd: directory,
          onlyFiles: true,
        }),
      ),
  ).pipe(
    Effect.orElseSucceed((): string[] => []),
    Effect.map((matches: string[]): readonly string[] =>
      matches
        .sort((left: string, right: string): number =>
          left.localeCompare(right),
        )
        .map(toPosixPath),
    ),
  );

/** First file matching the glob; shard `00001` sorts first. */
const scanDirectory = (
  directory: string,
  pattern: string,
): Effect.Effect<Option.Option<string>> =>
  scanFiles(directory, pattern).pipe(
    Effect.map(
      (matches: readonly string[]): Option.Option<string> =>
        Option.fromNullable(matches.at(0)),
    ),
  );

/** A local model may live outside the model directory; it is mounted from its own. */
const resolveLocalFile = (
  dependencies: ModelDependencies,
  directory: string,
  source: LocalFileSource,
): Effect.Effect<ResolvedModel, ModelFileMissingError | PlatformError> =>
  Effect.gen(function* () {
    const absolute: string = dependencies.path.isAbsolute(source.path)
      ? source.path
      : dependencies.path.resolve(directory, source.path);
    if (!(yield* dependencies.fileSystem.exists(absolute))) {
      return yield* new ModelFileMissingError({ path: absolute });
    }
    return {
      directory: toPosixPath(dependencies.path.dirname(absolute)),
      file: toPosixPath(dependencies.path.basename(absolute)),
    };
  });

/** Deleting a file that is not there is the expected case, never a failure. */
const removeQuietly = (
  dependencies: ModelDependencies,
  path: string,
): Effect.Effect<void> =>
  dependencies.fileSystem
    .remove(path)
    .pipe(Effect.catchAll((): Effect.Effect<void> => Effect.void));

/**
 * Streams the download straight to disk: model files do not fit in memory.
 * It lands on a `.part` file renamed only once the transfer completed, so an
 * interrupted download never leaves a truncated `.gguf` behind to be served.
 */
const resolveDownloadUrl = (
  dependencies: ModelDependencies,
  directory: string,
  source: DownloadUrlSource,
): Effect.Effect<ResolvedModel, ModelDownloadError | PlatformError> =>
  Effect.gen(function* () {
    const named: Option.Option<string> = fileNameFromUrl(source.url);
    if (Option.isNone(named)) {
      return yield* new ModelDownloadError({
        reason: Model.messages.unnamedUrl,
        url: source.url,
      });
    }
    const file: string = named.value;
    const target: string = dependencies.path.join(directory, file);
    const partial: string = `${target}${Model.partialExtension}`;
    yield* dependencies.fileSystem.makeDirectory(directory, {
      recursive: true,
    });
    yield* removeQuietly(dependencies, partial);
    yield* Console.log(Model.messages.downloadingUrl(source.url, target));
    yield* Effect.ensuring(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          catch: (cause: unknown): ModelDownloadError =>
            new ModelDownloadError({ reason: String(cause), url: source.url }),
          try: async (): Promise<number> => {
            const response: Response = await fetch(source.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await Bun.write(partial, response);
          },
        });
        yield* dependencies.fileSystem.rename(partial, target);
      }),
      removeQuietly(dependencies, partial),
    );
    return { directory: toPosixPath(directory), file };
  });

const resolveHuggingFace = (
  dependencies: ModelDependencies,
  directory: string,
  source: HuggingFaceSource,
): Effect.Effect<ResolvedModel, ModelResolutionError> =>
  Effect.gen(function* () {
    const local: Option.Option<string> = yield* scanDirectory(
      directory,
      source.include,
    );
    if (Option.isSome(local)) {
      return { directory: toPosixPath(directory), file: local.value };
    }
    if (
      !(yield* dependencies.processes.succeeds(
        Model.huggingFace.cli,
        Model.huggingFace.probeArgs,
      ))
    ) {
      return yield* new HuggingFaceCliMissingError({
        repository: source.repository,
      });
    }
    yield* Console.log(
      Model.messages.downloadingRepository(
        source.repository,
        source.include,
        directory,
      ),
    );
    yield* dependencies.processes.run(Model.huggingFace.cli, [
      ...Model.huggingFace.downloadArgs,
      source.repository,
      Model.huggingFace.includeFlag,
      source.include,
      Model.huggingFace.localDirectoryFlag,
      directory,
    ]);
    const downloaded: Option.Option<string> = yield* scanDirectory(
      directory,
      source.include,
    );
    return yield* Option.match(downloaded, {
      onNone: (): ModelNotFoundError =>
        new ModelNotFoundError({ directory, pattern: source.include }),
      onSome: (file: string): Effect.Effect<ResolvedModel> =>
        Effect.succeed({ directory: toPosixPath(directory), file }),
    });
  });

interface ListDependencies {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}

const describeFile = (
  dependencies: ListDependencies,
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

/** Every model file under the directory `.env` points at, with its size. */
const listLocalModels = (
  dependencies: ListDependencies,
  directory: string,
): Effect.Effect<readonly ModelListing[]> =>
  Effect.gen(function* () {
    const files: readonly string[] = yield* scanFiles(
      directory,
      `*${Model.extension}`,
    );
    return yield* Effect.forEach(files, (file: string) =>
      describeFile(dependencies, directory, file),
    );
  });

/** Dispatches on the source the CLI was given; there is no implicit default. */
const resolveModel = (
  dependencies: ModelDependencies,
  request: ModelRequest,
): Effect.Effect<ResolvedModel, ModelResolutionError> => {
  const directory: string = dependencies.path.resolve(request.directory);
  if (request.source.kind === "LocalFile") {
    return resolveLocalFile(dependencies, directory, request.source);
  }
  if (request.source.kind === "DownloadUrl") {
    return resolveDownloadUrl(dependencies, directory, request.source);
  }
  return resolveHuggingFace(dependencies, directory, request.source);
};

export { listLocalModels, resolveModel };
