import { ChildProcess } from "@app/cli/process/process.constants.ts";
import type { ProcessApi } from "@app/cli/process/process.interface.ts";
import type { RunOptions } from "@app/cli/process/process.types.ts";
import { CommandFailedError } from "@app/cli/process/process.types.ts";
import { Project } from "@app/cli/project/project.constants.ts";
import { Command, CommandExecutor } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { type Chunk, Effect, Stream } from "effect";

/** Concatenates the raw chunks a piped stream produced, then decodes as UTF-8. */
const decodeOutput = (chunks: Chunk.Chunk<Uint8Array>): string => {
  const parts: readonly Uint8Array[] = Array.from(chunks);
  const merged: Uint8Array = new Uint8Array(
    parts.reduce(
      (total: number, part: Uint8Array): number => total + part.byteLength,
      0,
    ),
  );
  parts.reduce((offset: number, part: Uint8Array): number => {
    merged.set(part, offset);
    return offset + part.byteLength;
  }, 0);
  return new TextDecoder().decode(merged);
};

/** Both pipes are drained while the process runs: a full pipe blocks it. */
const collect = (
  stream: Stream.Stream<Uint8Array, PlatformError>,
): Effect.Effect<string, PlatformError> =>
  Stream.runCollect(stream).pipe(Effect.map(decodeOutput));

const buildCommand = (
  executable: string,
  args: readonly string[],
  quiet: boolean,
): Command.Command => {
  const stream: Command.CommandInput = quiet
    ? ChildProcess.stdio.pipe
    : ChildProcess.stdio.inherit;
  return Command.make(executable, ...args).pipe(
    Command.workingDirectory(Project.root),
    Command.stdin(stream),
    Command.stdout(stream),
    Command.stderr(stream),
  );
};

class ProcessService extends Effect.Service<ProcessService>()(
  "ProcessService",
  {
    effect: Effect.gen(function* () {
      const executor: CommandExecutor.CommandExecutor =
        yield* CommandExecutor.CommandExecutor;

      const run = (
        executable: string,
        args: readonly string[],
        options?: RunOptions,
      ): Effect.Effect<void, CommandFailedError | PlatformError> =>
        executor
          .exitCode(buildCommand(executable, args, options?.quiet ?? false))
          .pipe(
            Effect.flatMap(
              (exitCode: number): Effect.Effect<void, CommandFailedError> =>
                exitCode === ChildProcess.successExitCode
                  ? Effect.void
                  : new CommandFailedError({
                      command: [executable, ...args].join(" "),
                      exitCode,
                    }),
            ),
          );

      const runCaptured = (
        executable: string,
        args: readonly string[],
      ): Effect.Effect<string, CommandFailedError | PlatformError> =>
        Effect.scoped(
          Effect.gen(function* () {
            const child: CommandExecutor.Process = yield* executor.start(
              buildCommand(executable, args, true),
            );
            const captured: {
              readonly exitCode: number;
              readonly stderr: string;
              readonly stdout: string;
            } = yield* Effect.all(
              {
                exitCode: child.exitCode,
                stderr: collect(child.stderr),
                stdout: collect(child.stdout),
              },
              { concurrency: "unbounded" },
            );
            return captured.exitCode === ChildProcess.successExitCode
              ? captured.stdout
              : yield* new CommandFailedError({
                  command: [executable, ...args].join(" "),
                  exitCode: captured.exitCode,
                  output: captured.stderr.slice(-ChildProcess.stderrTailLength),
                });
          }),
        );

      const succeeds = (
        executable: string,
        args: readonly string[],
      ): Effect.Effect<boolean> =>
        run(executable, args, { quiet: true }).pipe(Effect.isSuccess);

      const api: ProcessApi = { run, runCaptured, succeeds };
      return api;
    }),
  },
) {}

export { ProcessService };
