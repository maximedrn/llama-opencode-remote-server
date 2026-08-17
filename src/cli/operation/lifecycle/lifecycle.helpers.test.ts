import { describe, expect, test } from "bun:test";
import { waitLlamaHealthy } from "@app/cli/operation/lifecycle/lifecycle.helpers.ts";
import { LlamaNotHealthyError } from "@app/cli/operation/lifecycle/lifecycle.types.ts";
import type { StackDependencies } from "@app/cli/operation/stack/stack.interface.ts";
import type { DockerApi } from "@app/cli/resource/docker/docker.interface.ts";
import { Effect, Either } from "effect";

const dependencies = (output: string): StackDependencies => {
  const docker: DockerApi = {
    assertAvailable: Effect.void,
    compose: (): Effect.Effect<void> => Effect.void,
    composeCaptured: (): Effect.Effect<string> => Effect.succeed(output),
  };
  return { docker } as unknown as StackDependencies;
};

const wait = (output: string): Promise<Either.Either<void, unknown>> =>
  Effect.runPromise(
    waitLlamaHealthy(dependencies(output), "cpu", { local: true }, 2, 1).pipe(
      Effect.either,
    ),
  );

describe("waitLlamaHealthy", () => {
  test("succeeds once llama.cpp is healthy and nothing fronts it", async () => {
    const result: Either.Either<void, unknown> = await wait(
      JSON.stringify([
        { Health: "healthy", Service: "llama", State: "running" },
      ]),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("waits for the keep-alive front too when it runs", async () => {
    const result: Either.Either<void, unknown> = await wait(
      JSON.stringify([
        { Health: "healthy", Service: "llama", State: "running" },
        { Health: "starting", Service: "heartbeat", State: "running" },
      ]),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(LlamaNotHealthyError);
    }
  });

  test("gives up while llama.cpp is still loading", async () => {
    const result: Either.Either<void, unknown> = await wait(
      JSON.stringify([
        { Health: "starting", Service: "llama", State: "running" },
      ]),
    );
    expect(Either.isLeft(result)).toBe(true);
  });

  test("treats malformed compose output as not healthy yet", async () => {
    expect(Either.isLeft(await wait("not-json"))).toBe(true);
  });
});
