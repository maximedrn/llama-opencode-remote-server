import type { EnvApi } from "@app/cli/resource/env/env.interface.ts";
import type { NativeLifecycleError } from "@app/cli/resource/native/native.types.ts";
import type { SecretApi } from "@app/cli/resource/secret/secret.interface.ts";
import type { HostApi } from "@app/cli/system/host/host.interface.ts";
import type { FileSystem, Path } from "@effect/platform";
import type { Effect } from "effect";

interface NativeDependencies {
  readonly env: EnvApi;
  readonly fileSystem: FileSystem.FileSystem;
  readonly host: HostApi;
  readonly path: Path.Path;
  readonly secrets: SecretApi;
}

interface NativeApi {
  readonly logs: Effect.Effect<void, NativeLifecycleError>;
  readonly preflight: (
    backend: "hip" | "vulkan",
    local: boolean,
  ) => Effect.Effect<void, NativeLifecycleError>;
  readonly start: (
    backend: "hip" | "vulkan",
  ) => Effect.Effect<void, NativeLifecycleError>;
  readonly status: (json: boolean) => Effect.Effect<void, NativeLifecycleError>;
  readonly stop: Effect.Effect<void, NativeLifecycleError>;
}

export type { NativeApi, NativeDependencies };
