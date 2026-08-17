import {
  Backends,
  HardwareBackends,
} from "@app/cli/backend/backend.constants.ts";
import type { BackendApi } from "@app/cli/backend/backend.interface.ts";
import {
  type Backend,
  IncompatibleHostError,
  UnsupportedBackendError,
} from "@app/cli/backend/backend.types.ts";
import { Host } from "@app/cli/host/host.constants.ts";
import { HostService } from "@app/cli/host/host.service.ts";
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";

const isBackend = (value: string): value is Backend =>
  (Backends.list as readonly string[]).includes(value);

const reject = (reason: string): IncompatibleHostError =>
  new IncompatibleHostError({ reason });

const parseBackend = (
  value: string,
): Effect.Effect<Backend, UnsupportedBackendError> =>
  isBackend(value)
    ? Effect.succeed(value)
    : new UnsupportedBackendError({ backend: value });

class BackendService extends Effect.Service<BackendService>()(
  "BackendService",
  {
    dependencies: [HostService.Default],
    effect: Effect.gen(function* () {
      const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;
      const host: HostService = yield* HostService;

      const isWslKernel: Effect.Effect<boolean> = fileSystem
        .readFileString(Backends.kernelVersionFile)
        .pipe(
          Effect.orElseSucceed((): string => ""),
          Effect.map((kernel: string): boolean =>
            kernel.toLowerCase().includes(Backends.wslMarker),
          ),
        );

      const assertAmdHost: Effect.Effect<void, IncompatibleHostError> =
        Effect.gen(function* () {
          if (!host.isPlatform(Host.platforms.linux)) {
            return yield* reject(Backends.messages.amdNeedsLinux);
          }
          if (yield* isWslKernel) {
            return yield* reject(Backends.messages.amdNeedsNativeKernel);
          }
        });

      const assertHost = (
        backend: Backend,
      ): Effect.Effect<void, IncompatibleHostError> => {
        if (
          backend === HardwareBackends.nvidia &&
          host.isPlatform(Host.platforms.macos)
        ) {
          return reject(Backends.messages.nvidiaNotOnMacos);
        }
        return backend === HardwareBackends.amd ? assertAmdHost : Effect.void;
      };

      const assertDevice = (
        device: string,
      ): Effect.Effect<void, IncompatibleHostError | PlatformError> =>
        fileSystem
          .exists(device)
          .pipe(
            Effect.flatMap(
              (exists: boolean): Effect.Effect<void, IncompatibleHostError> =>
                exists
                  ? Effect.void
                  : reject(Backends.messages.missingRocmDevice(device)),
            ),
          );

      const assertDevices = (
        backend: Backend,
      ): Effect.Effect<void, IncompatibleHostError | PlatformError> =>
        backend === HardwareBackends.amd
          ? Effect.forEach(Backends.rocmDevices, assertDevice, {
              discard: true,
            })
          : Effect.void;

      const api: BackendApi = {
        assertDevices,
        assertHost,
        parse: parseBackend,
      };
      return api;
    }),
  },
) {}

export { BackendService };
