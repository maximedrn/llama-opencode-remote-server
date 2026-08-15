import type {
  EnvNotInitializedError,
  EnvRecord,
  ModelLocation,
  StackEnv,
} from "@app/env/env.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { Effect } from "effect";

interface EnvApi {
  /** Reads `.env` through a `ConfigProvider`; every field is optional. */
  readonly read: Effect.Effect<StackEnv, PlatformError>;
  /** Reads the model location, failing when `init` has not written it yet. */
  readonly requireModel: Effect.Effect<
    ModelLocation,
    EnvNotInitializedError | PlatformError
  >;
  readonly write: (values: EnvRecord) => Effect.Effect<void, PlatformError>;
}

export type { EnvApi };
