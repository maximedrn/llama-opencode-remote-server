import type { Backend } from "@app/cli/backend/backend.types.ts";
import type {
  ComposeOptions,
  DockerUnavailableError,
} from "@app/cli/docker/docker.types.ts";
import type { CommandFailedError } from "@app/cli/process/process.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { Effect } from "effect";

interface DockerApi {
  /** Fails when Docker or Compose v2 is missing. */
  readonly assertAvailable: Effect.Effect<void, DockerUnavailableError>;
  readonly compose: (
    backend: Backend,
    args: readonly string[],
    options?: ComposeOptions,
  ) => Effect.Effect<void, CommandFailedError | PlatformError>;
  /** Runs a Compose command and returns its stdout instead of streaming it. */
  readonly composeCaptured: (
    backend: Backend,
    args: readonly string[],
    options?: ComposeOptions,
  ) => Effect.Effect<string, CommandFailedError | PlatformError>;
}

export type { DockerApi };
