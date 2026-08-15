import { ChildProcess } from "@app/process/process.constants.ts";
import { Data } from "effect";

interface RunOptions {
  /** Discards stdout/stderr instead of inheriting the terminal. */
  readonly quiet?: boolean;
}

class CommandFailedError extends Data.TaggedError("CommandFailedError")<{
  readonly command: string;
  readonly exitCode: number;
}> {
  override get message(): string {
    return ChildProcess.messages.commandFailed(this.command, this.exitCode);
  }
}

export { CommandFailedError, type RunOptions };
