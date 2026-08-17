import type {
  ClientEnv,
  EnvNotInitializedError,
  EnvReadError,
  EnvRecord,
  ModelLocation,
  StackEnv,
} from "@app/cli/resource/env/env.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { Effect } from "effect";

interface EnvApi {
  /** Reads `.env` through a `ConfigProvider`; every field is optional. */
  readonly read: Effect.Effect<StackEnv, EnvReadError | PlatformError>;
  /** Reads `clients/client.env`; empty values come back as `None`. */
  readonly readClient: Effect.Effect<ClientEnv, EnvReadError | PlatformError>;
  /** Raw `KEY=value` map of `.env`, empty when the file is not there yet. */
  readonly readRaw: Effect.Effect<EnvRecord, PlatformError>;
  /** Reads the model location, failing when `init` has not written it yet. */
  readonly requireModel: Effect.Effect<
    ModelLocation,
    EnvNotInitializedError | EnvReadError | PlatformError
  >;
  readonly write: (values: EnvRecord) => Effect.Effect<void, PlatformError>;
}

export type { EnvApi };
