import { describe, expect, test } from "bun:test";
import type { DockerApi } from "@app/cli/docker/docker.interface.ts";
import { DockerService } from "@app/cli/docker/docker.service.ts";
import { composeArgs } from "@app/cli/docker/docker.utils.ts";
import type { ProcessApi } from "@app/cli/process/process.interface.ts";
import { ProcessService } from "@app/cli/process/process.service.ts";
import { Effect, Layer } from "effect";

interface ProcessSpy {
  readonly api: ProcessApi;
  readonly calls: string[][];
}

const spyProcesses = (output: string): ProcessSpy => {
  const calls: string[][] = [];
  return {
    api: {
      run: (): Effect.Effect<void> => Effect.void,
      runCaptured: (
        _executable: string,
        args: readonly string[],
      ): Effect.Effect<string> => {
        calls.push([...args]);
        return Effect.succeed(output);
      },
      succeeds: (): Effect.Effect<boolean> => Effect.succeed(true),
    },
    calls,
  };
};

describe("composeCaptured", () => {
  test("prefixes the compose arguments and returns the output", async () => {
    const spy: ProcessSpy = spyProcesses('{"ok":true}');
    const output: string = await Effect.runPromise(
      Effect.gen(function* () {
        const docker: DockerApi = yield* DockerService;
        return yield* docker.composeCaptured("cpu", ["ps"], { local: true });
      }).pipe(
        Effect.provide(
          DockerService.DefaultWithoutDependencies.pipe(
            Layer.provide(
              Layer.succeed(ProcessService, ProcessService.make(spy.api)),
            ),
          ),
        ),
      ),
    );
    expect(output).toBe('{"ok":true}');
    expect(spy.calls[0]).toEqual([
      ...composeArgs("cpu", { local: true }),
      "ps",
    ]);
  });
});
