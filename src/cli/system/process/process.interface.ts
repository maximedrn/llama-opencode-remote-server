import type {
  CommandFailedError,
  RunOptions,
} from "@app/cli/system/process/process.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { Effect } from "effect";

interface ProcessApi {
  /** Runs a command from the repository root, failing on a non-zero exit code. */
  readonly run: (
    executable: string,
    args: readonly string[],
    options?: RunOptions,
  ) => Effect.Effect<void, CommandFailedError | PlatformError>;
  /** Runs a piped command, returning stdout and keeping stderr on failure. */
  readonly runCaptured: (
    executable: string,
    args: readonly string[],
  ) => Effect.Effect<string, CommandFailedError | PlatformError>;
  /** Runs a command silently, reporting success even when the binary is absent. */
  readonly succeeds: (
    executable: string,
    args: readonly string[],
  ) => Effect.Effect<boolean>;
}

export type { ProcessApi };
