import { describe, expect, test } from "bun:test";
import type { EnvApi } from "@app/env/env.interface.ts";
import {
  type ClientEnv,
  EnvNotInitializedError,
  type ModelLocation,
  type StackEnv,
} from "@app/env/env.types.ts";
import { health, servedModels, smokeTest } from "@app/stack/client.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import {
  LlamaAuthError,
  LlamaUnreachableError,
  type ModelListing,
} from "@app/stack/stack.types.ts";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import type { Server } from "bun";
import { Effect, Either, Option } from "effect";

/** A client host has `clients/client.env` and nothing else: no `.env` at all. */
const clientOnlyEnv = (baseUrl: string): EnvApi => ({
  read: Effect.succeed({
    backend: Option.none(),
    composeFile: Option.none(),
    localPort: Option.none(),
    modelAlias: Option.none(),
    modelDirectory: Option.none(),
    modelFile: Option.none(),
  } satisfies StackEnv),
  readClient: Effect.succeed({
    accessClientId: Option.none(),
    accessClientSecret: Option.none(),
    apiKey: Option.some("llama_test"),
    baseUrl: Option.some(baseUrl),
  } satisfies ClientEnv),
  requireModel: Effect.fail(
    new EnvNotInitializedError({ missing: "MODEL_DIRECTORY, MODEL_FILE" }),
  ) as Effect.Effect<ModelLocation, EnvNotInitializedError>,
  write: (): Effect.Effect<void> => Effect.void,
});

const run = <A, E>(
  baseUrl: string,
  use: (dependencies: StackDependencies) => Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const dependencies: StackDependencies = {
        env: clientOnlyEnv(baseUrl),
        httpClient: yield* HttpClient.HttpClient,
      } as unknown as StackDependencies;
      return yield* use(dependencies).pipe(Effect.either);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );

const completion: string = JSON.stringify({
  choices: [{ message: { content: "OK" } }],
});

const serve = (handler: (request: Request) => Response): Server<unknown> =>
  Bun.serve({ fetch: handler, port: 0 });

const authorized = (request: Request): boolean =>
  request.headers.get("authorization") === "Bearer llama_test";

describe("smokeTest", () => {
  test("prints the completion of an authenticated answer", async () => {
    const server: Server<unknown> = serve(
      (request: Request): Response =>
        authorized(request)
          ? new Response(completion, {
              headers: { "content-type": "application/json" },
            })
          : new Response("no", { status: 401 }),
    );
    const result: Either.Either<void, unknown> = await run(
      `http://127.0.0.1:${server.port}`,
      smokeTest,
    );
    await server.stop(true);
    expect(Either.isRight(result)).toBe(true);
  });

  test("reports a refused key as LlamaAuthError", async () => {
    const server: Server<unknown> = serve(
      (): Response => new Response("denied", { status: 403 }),
    );
    const result: Either.Either<void, unknown> = await run(
      `http://127.0.0.1:${server.port}`,
      smokeTest,
    );
    await server.stop(true);
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(LlamaAuthError);
    }
  });

  test("reports a dead endpoint as LlamaUnreachableError", async () => {
    const result: Either.Either<void, unknown> = await run(
      "http://127.0.0.1:9",
      smokeTest,
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(LlamaUnreachableError);
    }
  });
});

describe("health", () => {
  test("asks for a single token and accepts the answer", async () => {
    let budget = 0;
    const server: Server<unknown> = Bun.serve({
      fetch: async (request: Request): Promise<Response> => {
        // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
        const body: { readonly max_tokens: number } = await request.json();
        budget = body.max_tokens;
        return new Response(completion, {
          headers: { "content-type": "application/json" },
        });
      },
      port: 0,
    });
    const result: Either.Either<void, unknown> = await run(
      `http://127.0.0.1:${server.port}`,
      health,
    );
    await server.stop(true);
    expect(Either.isRight(result)).toBe(true);
    expect(budget).toBe(1);
  });
});

describe("servedModels", () => {
  test("lists what the server itself reports", async () => {
    const server: Server<unknown> = serve(
      (): Response => Response.json({ data: [{ id: "phi-3-7b" }] }),
    );
    const result: Either.Either<readonly ModelListing[], unknown> = await run(
      `http://127.0.0.1:${server.port}`,
      servedModels,
    );
    await server.stop(true);
    expect(result).toEqual(
      Either.right([{ name: "phi-3-7b", size: Option.none() }]),
    );
  });
});
