import { afterAll, describe, expect, test } from "bun:test";
import type { EnvApi } from "@app/env/env.interface.ts";
import { EnvNotInitializedError } from "@app/env/env.types.ts";
import { listModels } from "@app/stack/models.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import type { ModelListing } from "@app/stack/stack.types.ts";
import {
  FetchHttpClient,
  FileSystem,
  HttpClient,
  Path,
} from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import type { Server } from "bun";
import { Effect, Option } from "effect";

const directory: string = "/tmp/llama-stack-test/listing";

const withPlatform = <A>(
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
      baseUrl: Option.some("http://127.0.0.1:49951"),
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
    withPlatform((fileSystem: FileSystem.FileSystem) =>
      fileSystem.remove(directory, { force: true, recursive: true }),
    ),
);

describe("listModels", () => {
  test("lists the local files with their size on a server host", async () => {
    await withPlatform((fileSystem: FileSystem.FileSystem) =>
      Effect.gen(function* () {
        yield* fileSystem.makeDirectory(directory, { recursive: true });
        yield* fileSystem.writeFileString(
          `${directory}/phi.gguf`,
          "a".repeat(1000),
        );
      }),
    );
    const models: readonly ModelListing[] = await list(true);
    expect(models).toEqual([{ name: "phi.gguf", size: Option.some(1000) }]);
  });

  test("falls back to the served listing on a client host", async () => {
    const server: Server<unknown> = Bun.serve({
      fetch: (): Response => Response.json({ data: [{ id: "served-model" }] }),
      port: 49_951,
    });
    const models: readonly ModelListing[] = await list(false);
    await server.stop(true);
    expect(models).toEqual([{ name: "served-model", size: Option.none() }]);
  });
});
