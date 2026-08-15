import { ChildProcess } from "@app/process/process.constants.ts";
import type { ProcessApi } from "@app/process/process.interface.ts";
import type { RunOptions } from "@app/process/process.types.ts";
import { CommandFailedError } from "@app/process/process.types.ts";
import { Project } from "@app/project/project.constants.ts";
import { Command, CommandExecutor } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";

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

      const succeeds = (
        executable: string,
        args: readonly string[],
      ): Effect.Effect<boolean> =>
        run(executable, args, { quiet: true }).pipe(Effect.isSuccess);

      const api: ProcessApi = { run, succeeds };
      return api;
    }),
  },
) {}

export { ProcessService };
