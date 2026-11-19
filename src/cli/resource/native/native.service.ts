import { EnvService } from "@app/cli/resource/env/env.service.ts";
import { preflight } from "@app/cli/resource/native/native.helpers.ts";
import type {
  NativeApi,
  NativeDependencies,
} from "@app/cli/resource/native/native.interface.ts";
import {
  logs,
  start,
  status,
  stop,
} from "@app/cli/resource/native/native.lifecycle.ts";
import type { NativeLifecycleError } from "@app/cli/resource/native/native.types.ts";
import { SecretService } from "@app/cli/resource/secret/secret.service.ts";
import { HostService } from "@app/cli/system/host/host.service.ts";
import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";

/** Both native backends expose the same lifecycle as the Docker stack. */
class NativeService extends Effect.Service<NativeService>()("NativeService", {
  dependencies: [
    EnvService.Default,
    HostService.Default,
    SecretService.Default,
  ],
  effect: Effect.gen(function* () {
    const dependencies: NativeDependencies = {
      env: yield* EnvService,
      fileSystem: yield* FileSystem.FileSystem,
      host: yield* HostService,
      path: yield* Path.Path,
      secrets: yield* SecretService,
    };
    const api: NativeApi = {
      logs: logs(dependencies),
      preflight: (
        backend: "hip" | "vulkan",
        local: boolean,
      ): Effect.Effect<void, NativeLifecycleError> =>
        preflight(dependencies, backend, local),
      start: (
        backend: "hip" | "vulkan",
      ): Effect.Effect<void, NativeLifecycleError> =>
        start(dependencies, backend),
      status: (json: boolean): Effect.Effect<void, NativeLifecycleError> =>
        status(dependencies, json),
      stop: stop(dependencies),
    };
    return api;
  }),
}) {}

export { NativeService };
