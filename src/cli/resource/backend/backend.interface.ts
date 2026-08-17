import type {
  Backend,
  IncompatibleHostError,
  UnsupportedBackendError,
} from "@app/cli/resource/backend/backend.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { Effect } from "effect";

interface BackendApi {
  /** Fails when the accelerator device nodes are not exposed yet. */
  readonly assertDevices: (
    backend: Backend,
  ) => Effect.Effect<void, IncompatibleHostError | PlatformError>;
  /** Fails when the host cannot run the backend at all. */
  readonly assertHost: (
    backend: Backend,
  ) => Effect.Effect<void, IncompatibleHostError | PlatformError>;
  readonly parse: (
    value: string,
  ) => Effect.Effect<Backend, UnsupportedBackendError>;
}

export type { BackendApi };
