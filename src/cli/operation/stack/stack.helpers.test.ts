import { afterAll, describe, expect, test } from "bun:test";
import {
  initialize,
  listModels,
} from "@app/cli/operation/stack/stack.helpers.ts";
import type { StackDependencies } from "@app/cli/operation/stack/stack.interface.ts";
import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import type { EnvApi } from "@app/cli/resource/env/env.interface.ts";
import { EnvService } from "@app/cli/resource/env/env.service.ts";
import { EnvNotInitializedError } from "@app/cli/resource/env/env.types.ts";
import type {
  ModelListing,
  ModelRequest,
  ResolvedModel,
} from "@app/cli/resource/model/model.types.ts";
import {
  FetchHttpClient,
  FileSystem,
  HttpClient,
  Path,
} from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import type { Server } from "bun";
import { Effect, Option, Redacted } from "effect";

const directory: string = "/tmp/llama-stack-test/listing";
const servedPort: number = 49_951;

const withFileSystem = <A>(
  use: (fileSystem: FileSystem.FileSystem) => Effect.Effect<A, unknown>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* use(yield* FileSystem.FileSystem);
    }).pipe(Effect.provide(BunContext.layer), Effect.orDie),
  );

const env = (initialized: boolean): EnvApi =>
  ({
    readClient: Effect.succeed({
      accessClientId: Option.none(),
      accessClientSecret: Option.none(),
      apiKey: Option.some("llama_test"),
      baseUrl: Option.some(`http://127.0.0.1:${servedPort}`),
    }),
    requireModel: initialized
      ? Effect.succeed({ directory, file: "phi.gguf" })
      : Effect.fail(new EnvNotInitializedError({ missing: "MODEL_DIRECTORY" })),
  }) as unknown as EnvApi;

const list = (initialized: boolean): Promise<readonly ModelListing[]> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const dependencies: StackDependencies = {
        env: env(initialized),
        fileSystem: yield* FileSystem.FileSystem,
        httpClient: yield* HttpClient.HttpClient,
        path: yield* Path.Path,
      } as unknown as StackDependencies;
      return yield* listModels(dependencies);
    }).pipe(
      Effect.provide(BunContext.layer),
      Effect.provide(FetchHttpClient.layer),
      Effect.orDie,
    ),
  );

afterAll(
  (): Promise<void> =>
    withFileSystem((fileSystem: FileSystem.FileSystem) =>
      fileSystem.remove(directory, { force: true, recursive: true }),
    ),
);

test("init leaves the configured .env intact even with --force", async () => {
  const original: string = [
    "# Local settings",
    "BACKEND=amd",
    'MODEL_DIRECTORY="/models"',
    "MODEL_FILE=phi.gguf",
    "",
  ].join("\n");
  let contents: string = original;
  const fileSystem: FileSystem.FileSystem = FileSystem.makeNoop({
    exists: (): Effect.Effect<boolean> => Effect.succeed(true),
    readFileString: (): Effect.Effect<string> =>
      Effect.sync((): string => contents),
    writeFileString: (file: string, value: string): Effect.Effect<void> =>
      Effect.sync((): void => {
        if (file === EnvFile.path) contents = value;
      }),
  });
  await Effect.runPromise(
    Effect.gen(function* () {
      const dependencies: StackDependencies = {
        backends: {
          assertHost: (): Effect.Effect<void> => Effect.void,
          parse: (value: string): Effect.Effect<"amd"> => {
            expect(value).toBe("amd");
            return Effect.succeed("amd");
          },
        },
        env: yield* EnvService,
        fileSystem,
        models: {
          resolve: (request: ModelRequest): Effect.Effect<ResolvedModel> => {
            expect(request.directory).toBe("/models");
            expect(request.source).toEqual({
              kind: "LocalFile",
              path: "/models/phi.gguf",
            });
            return Effect.succeed({ directory: "/models", file: "phi.gguf" });
          },
        },
        path: yield* Path.Path,
        secrets: {
          fingerprint: (): string => "fixture",
          generateApiKey: Effect.succeed(Redacted.make("test-key")),
          write: (): Effect.Effect<void> => Effect.void,
        },
      } as unknown as StackDependencies;
      yield* initialize(dependencies, {
        backend: Option.none(),
        force: true,
        include: Option.none(),
        keepalive: Option.none(),
        local: true,
        modelDirectory: Option.none(),
        modelFile: Option.none(),
        modelUrl: Option.none(),
        repository: Option.none(),
      });
    }).pipe(
      Effect.provide(EnvService.Default),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provide(Path.layer),
      Effect.provide(BunContext.layer),
    ),
  );
  expect(contents).toBe(original);
});

describe("listModels", () => {
  test("lists the local files with their size on a server host", async () => {
    await withFileSystem((fileSystem: FileSystem.FileSystem) =>
      Effect.gen(function* () {
        yield* fileSystem.makeDirectory(directory, { recursive: true });
        yield* fileSystem.writeFileString(
          `${directory}/phi.gguf`,
          "a".repeat(1000),
        );
      }),
    );
    expect(await list(true)).toEqual([
      { name: "phi.gguf", size: Option.some(1000) },
    ]);
  });

  test("falls back to the served listing on a client host", async () => {
    const server: Server<unknown> = Bun.serve({
      fetch: (): Response => Response.json({ data: [{ id: "served-model" }] }),
      port: servedPort,
    });
    const models: readonly ModelListing[] = await list(false);
    await server.stop(true);
    expect(models).toEqual([{ name: "served-model", size: Option.none() }]);
  });
});
