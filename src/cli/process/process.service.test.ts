import { describe, expect, test } from "bun:test";
import type { ProcessApi } from "@app/cli/process/process.interface.ts";
import { ProcessService } from "@app/cli/process/process.service.ts";
import { CommandFailedError } from "@app/cli/process/process.types.ts";
import { BunContext } from "@effect/platform-bun";
import { Effect, Either, Layer } from "effect";

const service: Layer.Layer<ProcessService> = ProcessService.Default.pipe(
  Layer.provide(BunContext.layer),
);

const withService = <A, E>(
  use: (processes: ProcessApi) => Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const processes: ProcessApi = yield* ProcessService;
      return yield* use(processes).pipe(Effect.either);
    }).pipe(Effect.provide(service)),
  );

describe("runCaptured", () => {
  test("returns stdout on success", async () => {
    const output: Either.Either<string, unknown> = await withService(
      (processes: ProcessApi) =>
        processes.runCaptured("bun", ["-e", 'console.log("hello")']),
    );
    expect(output).toEqual(Either.right("hello\n"));
  });

  test("keeps the stderr tail on CommandFailedError", async () => {
    const result: Either.Either<string, unknown> = await withService(
      (processes: ProcessApi) =>
        processes.runCaptured("bun", [
          "-e",
          'console.error("boom"); process.exit(1)',
        ]),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(CommandFailedError);
      expect(String(result.left)).toContain("boom");
    }
  });
});
