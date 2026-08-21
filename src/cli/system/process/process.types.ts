import { ChildProcess } from "@app/cli/system/process/process.constants.ts";
import { Data } from "effect";

interface RunOptions {
  /** Discards stdout/stderr instead of inheriting the terminal. */
  readonly quiet?: boolean;
}

/**
 * `output` carries the tail of the captured stderr: an exit code alone rarely
 * says why Docker, Compose or `hf` refused to do its job.
 */
class CommandFailedError extends Data.TaggedError("CommandFailedError")<{
  readonly command: string;
  readonly exitCode: number;
  readonly output?: string;
}> {
  override get message(): string {
    const base: string = ChildProcess.messages.commandFailed(
      this.command,
      this.exitCode,
    );
    const captured: string = (this.output ?? "").trim();
    return captured.length > 0 ? `${base}\n${captured}` : base;
  }
}

export { CommandFailedError, type RunOptions };
