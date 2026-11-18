import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import type { EnvApi } from "@app/cli/resource/env/env.interface.ts";
import type {
  EnvRecord,
  ModelLocation,
} from "@app/cli/resource/env/env.types.ts";
import { Native } from "@app/cli/resource/native/native.constants.ts";
import type { NativeDependencies } from "@app/cli/resource/native/native.interface.ts";
import type {
  NativeConfig,
  NativeLifecycleError,
  NativeState,
} from "@app/cli/resource/native/native.types.ts";
import { NativeError } from "@app/cli/resource/native/native.types.ts";
import {
  decodeState,
  matchesProcess,
  modelArgs,
  positiveInteger,
} from "@app/cli/resource/native/native.utils.ts";
import { Secrets } from "@app/cli/resource/secret/secret.constants.ts";
import { Host } from "@app/cli/system/host/host.constants.ts";
import type { Path } from "@effect/platform";
import { Effect, Option } from "effect";

/** Errors are values, never uncaught exceptions in the command lifecycle. */
const readPositive = (
  values: EnvRecord,
  name: string,
  fallback: string,
): Effect.Effect<number, NativeError> =>
  Effect.try({
    catch: (cause: unknown): NativeError =>
      cause instanceof NativeError
        ? cause
        : new NativeError({ reason: String(cause) }),
    try: (): number => positiveInteger(values[name] || fallback, name),
  });

const configuration = (
  env: Pick<EnvApi, "readRaw" | "requireModel">,
  path: Path.Path,
  backend: "hip" | "vulkan",
): Effect.Effect<NativeConfig, NativeLifecycleError> =>
  Effect.gen(function* () {
    const values: EnvRecord = yield* env.readRaw;
    const location: ModelLocation = yield* env.requireModel;
    const server: string = values[EnvFile.keys.nativeServer] ?? "";
    if (!(path.isAbsolute(server) && server.toLowerCase().endsWith(".exe"))) {
      return yield* new NativeError({
        reason: Native.messages.invalidConfiguration(EnvFile.keys.nativeServer),
      });
    }
    const context: number = yield* readPositive(
      values,
      EnvFile.keys.context,
      EnvFile.nativeContext,
    );
    const port: number = yield* readPositive(
      values,
      EnvFile.keys.localPort,
      Native.defaults.port,
    );
    if (port > 65_535) {
      return yield* new NativeError({
        reason: Native.messages.invalidConfiguration(EnvFile.keys.localPort),
      });
    }
    return {
      alias: values[EnvFile.keys.modelAlias] || "llama",
      cacheK: values[EnvFile.keys.cacheK] || Native.defaults.cache,
      cacheV: values[EnvFile.keys.cacheV] || Native.defaults.cache,
      context,
      device: values[EnvFile.keys.device] || Native.devices[backend],
      flashAttention:
        values[EnvFile.keys.flashAttention] || Native.defaults.flashAttention,
      modelArgs: modelArgs(values, context),
      modelPath: path.resolve(location.directory, location.file),
      port,
      serverPath: path.resolve(server),
    };
  });

const preflight = (
  dependencies: NativeDependencies,
  backend: "hip" | "vulkan",
  local: boolean,
): Effect.Effect<void, NativeLifecycleError> =>
  Effect.gen(function* () {
    if (!(dependencies.host.isPlatform(Host.platforms.windows) && local)) {
      return yield* new NativeError({ reason: Native.messages.nativeOnly });
    }
    const config: NativeConfig = yield* configuration(
      dependencies.env,
      dependencies.path,
      backend,
    );
    for (const file of [config.serverPath, config.modelPath]) {
      if (!(yield* dependencies.fileSystem.exists(file))) {
        return yield* new NativeError({ reason: `Missing file: ${file}` });
      }
    }
    yield* dependencies.secrets.assertPresent([Secrets.files.apiKey]);
  });

const savedState = (
  dependencies: NativeDependencies,
): Effect.Effect<Option.Option<NativeState>, NativeLifecycleError> =>
  Effect.gen(function* () {
    const exists: boolean = yield* dependencies.fileSystem.exists(
      Native.files.state,
    );
    if (!exists) return Option.none();
    const contents: string = yield* dependencies.fileSystem.readFileString(
      Native.files.state,
    );
    const state: Option.Option<NativeState> = decodeState(contents);
    if (Option.isNone(state)) {
      return yield* new NativeError({
        reason: "Invalid .runtime/native/llama.json state file.",
      });
    }
    return state;
  });

/** Verify the PID and executable name before attempting a Windows taskkill. */
const isRunning = (
  state: NativeState,
): Effect.Effect<boolean, NativeLifecycleError> =>
  Effect.try({
    catch: (cause: unknown): NativeError =>
      new NativeError({ reason: `Could not inspect PID: ${String(cause)}` }),
    try: (): boolean => {
      const result: Bun.SyncSubprocess<"pipe", "ignore"> = Bun.spawnSync({
        cmd: [
          "tasklist.exe",
          "/FI",
          `PID eq ${state.pid}`,
          "/FO",
          "CSV",
          "/NH",
        ],
        stderr: "ignore",
        stdout: "pipe",
        windowsHide: true,
      });
      return (
        result.exitCode === 0 &&
        matchesProcess(new TextDecoder().decode(result.stdout), state)
      );
    },
  });

export { configuration, isRunning, preflight, savedState };
