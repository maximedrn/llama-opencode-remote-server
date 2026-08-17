import type { SmokeTestError } from "@app/cli/operation/client/client.interface.ts";
import { Doctor } from "@app/cli/operation/doctor/doctor.constants.ts";
import type { IncompatibleHostError } from "@app/cli/resource/backend/backend.types.ts";
import type { DockerUnavailableError } from "@app/cli/resource/docker/docker.types.ts";
import type { EnvNotInitializedError } from "@app/cli/resource/env/env.types.ts";
import type { ModelFileMissingError } from "@app/cli/resource/model/model.types.ts";
import type { MissingSecretError } from "@app/cli/resource/secret/secret.types.ts";
import type { CommandFailedError } from "@app/cli/system/process/process.types.ts";
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
