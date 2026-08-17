import { describe, expect, test } from "bun:test";
import type { DockerApi } from "@app/docker/docker.interface.ts";
import { waitLlamaHealthy } from "@app/stack/rotate.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import { LlamaNotHealthyError } from "@app/stack/stack.types.ts";
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
  test("succeeds while the heartbeat reports a healthy llama", async () => {
    const result: Either.Either<void, unknown> = await wait(
      JSON.stringify([
        { Health: "healthy", Service: "heartbeat", State: "running" },
      ]),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("falls back to llama itself when no heartbeat runs", async () => {
    const result: Either.Either<void, unknown> = await wait(
      JSON.stringify([{ Service: "llama", State: "running" }]),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("gives up when the heartbeat never turns healthy", async () => {
    const result: Either.Either<void, unknown> = await wait(
      JSON.stringify([
        { Health: "starting", Service: "heartbeat", State: "running" },
      ]),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(LlamaNotHealthyError);
    }
  });

  test("treats malformed compose output as not healthy yet", async () => {
    expect(Either.isLeft(await wait("not-json"))).toBe(true);
  });
});
