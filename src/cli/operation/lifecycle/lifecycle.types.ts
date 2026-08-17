import { Lifecycle } from "@app/cli/operation/lifecycle/lifecycle.constants.ts";
import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import type { DockerUnavailableError } from "@app/cli/resource/docker/docker.types.ts";
import type { CommandFailedError } from "@app/cli/system/process/process.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { QuitException } from "@effect/platform/Terminal";
import { Data } from "effect";

/** The restarted stack never reported healthy within the poll window. */
class LlamaNotHealthyError extends Data.TaggedError("LlamaNotHealthyError")<{
  readonly backend: Backend;
}> {
  override get message(): string {
    return Lifecycle.messages.llamaNotHealthy(this.backend);
  }
}

type RotateKeyError = CommandFailedError | LlamaNotHealthyError | PlatformError;

type UninstallError =
  | CommandFailedError
  | DockerUnavailableError
  | PlatformError
  | QuitException;

export { LlamaNotHealthyError, type RotateKeyError, type UninstallError };
