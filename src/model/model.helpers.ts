import { Model } from "@app/model/model.constants.ts";
import type { ModelResolutionError } from "@app/model/model.interface.ts";
import {
  type DownloadUrlSource,
  HuggingFaceCliMissingError,
  type HuggingFaceSource,
  type LocalFileSource,
  ModelDownloadError,
  ModelFileMissingError,
  ModelNotFoundError,
  type ModelRequest,
  type ResolvedModel,
} from "@app/model/model.types.ts";
import { fileNameFromUrl, toPosixPath } from "@app/model/model.utils.ts";
import type { ProcessApi } from "@app/process/process.interface.ts";
import type { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Console, Effect, Option } from "effect";

interface ModelDependencies {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly processes: ProcessApi;
}

/** First file matching the glob anywhere under the directory. */
const scanDirectory = (
  directory: string,
  pattern: string,
): Effect.Effect<Option.Option<string>> =>
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
    Effect.map(
      (matches: string[]): Option.Option<string> =>
        Option.fromNullable(
          matches
            .sort((left: string, right: string): number =>
              left.localeCompare(right),
            )
            .at(0),
        ).pipe(Option.map(toPosixPath)),
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

/** Streams the download straight to disk: model files do not fit in memory. */
const resolveDownloadUrl = (
  dependencies: ModelDependencies,
  directory: string,
  source: DownloadUrlSource,
): Effect.Effect<ResolvedModel, ModelDownloadError | PlatformError> =>
  Effect.gen(function* () {
    const file: string = fileNameFromUrl(source.url);
    const target: string = dependencies.path.join(directory, file);
    yield* dependencies.fileSystem.makeDirectory(directory, {
      recursive: true,
    });
    yield* Console.log(Model.messages.downloadingUrl(source.url, target));
    yield* Effect.tryPromise({
      catch: (cause: unknown): ModelDownloadError =>
        new ModelDownloadError({ reason: String(cause), url: source.url }),
      try: async (): Promise<number> => {
        const response: Response = await fetch(source.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await Bun.write(target, response);
      },
    });
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

export { resolveModel };
