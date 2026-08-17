import type { IncompatibleHostError } from "@app/cli/backend/backend.types.ts";
import type { SmokeTestError } from "@app/cli/client/client.interface.ts";
import type { DockerUnavailableError } from "@app/cli/docker/docker.types.ts";
import { Doctor } from "@app/cli/doctor/doctor.constants.ts";
import type { EnvNotInitializedError } from "@app/cli/env/env.types.ts";
import type { ModelFileMissingError } from "@app/cli/model/model.types.ts";
import type { CommandFailedError } from "@app/cli/process/process.types.ts";
import type { MissingSecretError } from "@app/cli/secret/secret.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import { Data, type Option } from "effect";

/** One line of `stack doctor`, failures carrying the fix that clears them. */
interface DoctorResult {
  readonly detail: Option.Option<string>;
  readonly fix: Option.Option<string>;
  readonly label: string;
  readonly ok: boolean;
}

/** Anything a single check may fail with; each one is absorbed into a line. */
type DoctorCheckError =
  | CommandFailedError
  | DockerUnavailableError
  | EnvNotInitializedError
  | IncompatibleHostError
  | MissingSecretError
  | ModelFileMissingError
  | PlatformError
  | SmokeTestError;

/** Non-zero exit for `doctor`, so a script can gate on its verdict. */
class DoctorFailedError extends Data.TaggedError("DoctorFailedError")<{
  readonly failures: readonly string[];
}> {
  override get message(): string {
    return Doctor.messages.needsAttention(this.failures);
  }
}

export { type DoctorCheckError, DoctorFailedError, type DoctorResult };
