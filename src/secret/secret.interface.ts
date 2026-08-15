import type { MissingSecretError } from "@app/secret/secret.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { Effect, Redacted } from "effect";

interface SecretApi {
  /** Fails when a Compose secret file has not been generated yet. */
  readonly assertPresent: (
    names: readonly string[],
  ) => Effect.Effect<void, MissingSecretError | PlatformError>;
  /** Short SHA-256 fingerprint, safe to print and to compare with a client. */
  readonly fingerprint: (secret: Redacted.Redacted<string>) => string;
  readonly generateApiKey: Effect.Effect<Redacted.Redacted<string>>;
  readonly read: (
    name: string,
  ) => Effect.Effect<Redacted.Redacted<string>, PlatformError>;
  readonly rotateApiKey: Effect.Effect<
    Redacted.Redacted<string>,
    PlatformError
  >;
  readonly write: (
    name: string,
    value: Redacted.Redacted<string>,
  ) => Effect.Effect<void, PlatformError>;
}

export type { SecretApi };
