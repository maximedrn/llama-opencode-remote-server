import type {
  EnvNotInitializedError,
  EnvReadError,
} from "@app/cli/resource/env/env.types.ts";
import type { MissingSecretError } from "@app/cli/resource/secret/secret.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import { Data } from "effect";

interface NativeConfig {
  readonly alias: string;
  readonly cacheK: string;
  readonly cacheV: string;
  readonly context: number;
  readonly device: string;
  readonly flashAttention: string;
  readonly modelArgs: readonly string[];
  readonly modelPath: string;
  readonly port: number;
  readonly serverPath: string;
}

interface NativeState {
  readonly pid: number;
  readonly serverPath: string;
}

class NativeError extends Data.TaggedError("NativeError")<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

type NativeLifecycleError =
  | EnvNotInitializedError
  | EnvReadError
  | MissingSecretError
  | NativeError
  | PlatformError;

export {
  type NativeConfig,
  NativeError,
  type NativeLifecycleError,
  type NativeState,
};
