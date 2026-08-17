import { afterAll, describe, expect, test } from "bun:test";
import { resolveModel } from "@app/cli/resource/model/model.helpers.ts";
import type { ModelResolutionError } from "@app/cli/resource/model/model.interface.ts";
import type {
  ModelRequest,
  ResolvedModel,
} from "@app/cli/resource/model/model.types.ts";
import {
  HuggingFaceCliMissingError,
  ModelDownloadError,
  ModelNotFoundError,
} from "@app/cli/resource/model/model.types.ts";
import type { ProcessApi } from "@app/cli/system/process/process.interface.ts";
import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import type { Server } from "bun";
import { Effect, Either } from "effect";

interface Dependencies {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly processes: ProcessApi;
}

interface DownloadOutcome {
  readonly exists: boolean;
  readonly outcome: Either.Either<ResolvedModel, ModelResolutionError>;
  readonly partial: boolean;
}

const scratch: string = "/tmp/llama-stack-test/model";
const at = (name: string): string => `${scratch}/${name}`;

const missingCli: ProcessApi = {
  run: (): Effect.Effect<void> => Effect.void,
  runCaptured: (): Effect.Effect<string> => Effect.succeed(""),
  succeeds: (): Effect.Effect<boolean> => Effect.succeed(false),
};

const withFileSystem = <A>(
  use: (fileSystem: FileSystem.FileSystem) => Effect.Effect<A, unknown>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* use(yield* FileSystem.FileSystem);
    }).pipe(Effect.provide(BunContext.layer), Effect.orDie),
  );

const writeFile = (path: string): Promise<void> =>
  withFileSystem((fileSystem: FileSystem.FileSystem) =>
    Effect.gen(function* () {
      yield* fileSystem.makeDirectory(path.slice(0, path.lastIndexOf("/")), {
        recursive: true,
      });
      yield* fileSystem.writeFileString(path, "model-bytes");
    }),
  );

const resolve = (
  processes: ProcessApi,
  request: ModelRequest,
): Promise<Either.Either<ResolvedModel, ModelResolutionError>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const dependencies: Dependencies = {
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        processes,
      };
      return yield* resolveModel(dependencies, request).pipe(Effect.either);
    }).pipe(Effect.provide(BunContext.layer)),
  );

const download = (directory: string, url: string): Promise<DownloadOutcome> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;
      const dependencies: Dependencies = {
        fileSystem,
        path: yield* Path.Path,
        processes: missingCli,
      };
      const outcome: Either.Either<ResolvedModel, ModelResolutionError> =
        yield* resolveModel(dependencies, {
          directory,
          source: { kind: "DownloadUrl", url },
        }).pipe(Effect.either);
      return {
        exists: yield* fileSystem.exists(`${directory}/phi-3.gguf`),
        outcome,
        partial: yield* fileSystem.exists(`${directory}/phi-3.gguf.part`),
      };
    }).pipe(Effect.provide(BunContext.layer)),
  );

afterAll(
  (): Promise<void> =>
    withFileSystem((fileSystem: FileSystem.FileSystem) =>
      fileSystem.remove(scratch, { force: true, recursive: true }),
    ),
);

describe("resolveModel local files", () => {
  test("resolves an existing local file", async () => {
    await writeFile(at("local/model.gguf"));
    const result: Either.Either<ResolvedModel, ModelResolutionError> =
      await resolve(missingCli, {
        directory: at("local"),
        source: { kind: "LocalFile", path: "model.gguf" },
      });
    expect(result).toEqual(
      Either.right({ directory: at("local"), file: "model.gguf" }),
    );
  });

  test("fails when the local file is absent", async () => {
    const result: Either.Either<ResolvedModel, ModelResolutionError> =
      await resolve(missingCli, {
        directory: at("local"),
        source: { kind: "LocalFile", path: "absent.gguf" },
      });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("resolveModel downloads", () => {
  test("writes the download under the url file name", async () => {
    const server: Server<unknown> = Bun.serve({
      fetch: (): Response => new Response("model-bytes"),
      port: 0,
    });
    const result: DownloadOutcome = await download(
      at("download"),
      `http://127.0.0.1:${server.port}/phi-3.gguf`,
    );
    await server.stop(true);
    expect(Either.isRight(result.outcome)).toBe(true);
    expect(result.exists).toBe(true);
    expect(result.partial).toBe(false);
  });

  test("leaves no file behind when the download fails", async () => {
    const server: Server<unknown> = Bun.serve({
      fetch: (): Response => new Response("bad", { status: 500 }),
      port: 0,
    });
    const result: DownloadOutcome = await download(
      at("download-failed"),
      `http://127.0.0.1:${server.port}/phi-3.gguf`,
    );
    await server.stop(true);
    expect(Either.isLeft(result.outcome)).toBe(true);
    if (Either.isLeft(result.outcome)) {
      expect(result.outcome.left).toBeInstanceOf(ModelDownloadError);
    }
    expect(result.exists).toBe(false);
    expect(result.partial).toBe(false);
  });

  test("rejects urls whose last segment is not a model file", async () => {
    const result: Either.Either<ResolvedModel, ModelResolutionError> =
      await resolve(missingCli, {
        directory: at("download"),
        source: {
          kind: "DownloadUrl",
          url: "http://127.0.0.1:1/not-a-model",
        },
      });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("resolveModel Hugging Face", () => {
  test("prefers an already-downloaded Hugging Face model", async () => {
    await writeFile(at("hf/phi.gguf"));
    const result: Either.Either<ResolvedModel, ModelResolutionError> =
      await resolve(missingCli, {
        directory: at("hf"),
        source: {
          include: "*.gguf",
          kind: "HuggingFace",
          repository: "org/phi",
        },
      });
    expect(Either.isRight(result)).toBe(true);
  });

  test("fails with HuggingFaceCliMissingError when hf is absent", async () => {
    const result: Either.Either<ResolvedModel, ModelResolutionError> =
      await resolve(missingCli, {
        directory: at("hf-absent"),
        source: {
          include: "*.gguf",
          kind: "HuggingFace",
          repository: "org/phi",
        },
      });
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(HuggingFaceCliMissingError);
    }
  });

  test("downloads via hf when no local match exists", async () => {
    const directory: string = at("hf-download");
    const result: Either.Either<ResolvedModel, ModelResolutionError> =
      await resolve(
        {
          run: (): Effect.Effect<void> =>
            Effect.promise(
              (): Promise<void> => writeFile(`${directory}/phi.gguf`),
            ),
          runCaptured: (): Effect.Effect<string> => Effect.succeed(""),
          succeeds: (executable: string): Effect.Effect<boolean> =>
            Effect.succeed(executable === "hf"),
        },
        {
          directory,
          source: {
            include: "*.gguf",
            kind: "HuggingFace",
            repository: "org/phi",
          },
        },
      );
    expect(Either.isRight(result)).toBe(true);
  });

  test("fails when the hf download produced no file", async () => {
    const result: Either.Either<ResolvedModel, ModelResolutionError> =
      await resolve(
        {
          run: (): Effect.Effect<void> => Effect.void,
          runCaptured: (): Effect.Effect<string> => Effect.succeed(""),
          succeeds: (executable: string): Effect.Effect<boolean> =>
            Effect.succeed(executable === "hf"),
        },
        {
          directory: at("hf-empty"),
          source: {
            include: "*.gguf",
            kind: "HuggingFace",
            repository: "org/phi",
          },
        },
      );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(ModelNotFoundError);
    }
  });
});
