import { Native } from "@app/cli/resource/native/native.constants.ts";
import {
  configuration,
  isRunning,
  preflight,
  savedState,
} from "@app/cli/resource/native/native.helpers.ts";
import type { NativeDependencies } from "@app/cli/resource/native/native.interface.ts";
import type {
  NativeConfig,
  NativeLifecycleError,
  NativeState,
} from "@app/cli/resource/native/native.types.ts";
import { NativeError } from "@app/cli/resource/native/native.types.ts";
import { serverArgs } from "@app/cli/resource/native/native.utils.ts";
import { Secrets } from "@app/cli/resource/secret/secret.constants.ts";
import { Project } from "@app/cli/system/project/project.constants.ts";
import { Console, Effect, Option } from "effect";

const stop = (
  dependencies: NativeDependencies,
): Effect.Effect<void, NativeLifecycleError> =>
  Effect.gen(function* () {
    const state: Option.Option<NativeState> = yield* savedState(dependencies);
    if (Option.isNone(state)) {
      return yield* Console.log(Native.messages.notRunning);
    }
    if (!(yield* isRunning(state.value))) {
      return yield* new NativeError({ reason: Native.messages.processChanged });
    }
    const result: Bun.SyncSubprocess<"pipe", "pipe"> = yield* Effect.try({
      catch: (cause: unknown): NativeError =>
        new NativeError({ reason: String(cause) }),
      try: (): Bun.SyncSubprocess<"pipe", "pipe"> =>
        Bun.spawnSync({
          cmd: ["taskkill.exe", "/PID", String(state.value.pid), "/T", "/F"],
          stderr: "pipe",
          stdout: "pipe",
          windowsHide: true,
        }),
    });
    if (result.exitCode !== 0) {
      return yield* new NativeError({
        reason: new TextDecoder().decode(result.stderr),
      });
    }
    yield* dependencies.fileSystem.remove(Native.files.state);
    yield* Console.log(Native.messages.stopped);
  });

const spawn = (
  config: NativeConfig,
): Effect.Effect<Bun.Subprocess, NativeError> =>
  Effect.try({
    catch: (cause: unknown): NativeError =>
      new NativeError({ reason: `Cannot start llama.cpp: ${String(cause)}` }),
    try: (): Bun.Subprocess =>
      Bun.spawn({
        cmd: [
          config.serverPath,
          ...serverArgs(config, `${Secrets.directory}/${Secrets.files.apiKey}`),
        ],
        cwd: Project.root,
        detached: true,
        stderr: Bun.file(Native.files.errorLog),
        stdin: "ignore",
        stdout: Bun.file(Native.files.outputLog),
        windowsHide: true,
      }),
  });

const start = (
  dependencies: NativeDependencies,
  backend: "hip" | "vulkan",
): Effect.Effect<void, NativeLifecycleError> =>
  Effect.gen(function* () {
    yield* preflight(dependencies, backend, true);
    const existing: Option.Option<NativeState> =
      yield* savedState(dependencies);
    if (Option.isSome(existing)) {
      if (yield* isRunning(existing.value)) {
        return yield* new NativeError({
          reason: Native.messages.alreadyRunning(existing.value.pid),
        });
      }
      return yield* new NativeError({
        reason:
          "Stale PID: inspect .runtime/native/llama.json before restarting.",
      });
    }
    const config: NativeConfig = yield* configuration(
      dependencies.env,
      dependencies.path,
      backend,
    );
    yield* dependencies.fileSystem.makeDirectory(Native.directory, {
      recursive: true,
    });
    const subprocess: Bun.Subprocess = yield* spawn(config);
    const state: NativeState = {
      pid: subprocess.pid,
      serverPath: config.serverPath,
    };
    yield* dependencies.fileSystem
      .writeFileString(Native.files.state, JSON.stringify(state))
      .pipe(
        Effect.tapError(
          (): Effect.Effect<void> =>
            Effect.sync((): void => {
              subprocess.kill();
            }),
        ),
      );
    subprocess.unref();
    yield* Effect.sleep("500 millis");
    if (!(yield* isRunning(state))) {
      yield* dependencies.fileSystem.remove(Native.files.state);
      return yield* new NativeError({
        reason: "llama.cpp exited; inspect .runtime/native/llama.stderr.log.",
      });
    }
    yield* Console.log(Native.messages.started(subprocess.pid));
  });

const status = (
  dependencies: NativeDependencies,
  json: boolean,
): Effect.Effect<void, NativeLifecycleError> =>
  Effect.gen(function* () {
    const state: Option.Option<NativeState> = yield* savedState(dependencies);
    const running: boolean =
      Option.isSome(state) && (yield* isRunning(state.value));
    const pid: number | undefined = Option.isSome(state)
      ? state.value.pid
      : undefined;
    const report: {
      readonly pid: number | undefined;
      readonly status: string;
    } = {
      pid,
      status: running ? "running" : "stopped",
    };
    yield* Console.log(
      json
        ? JSON.stringify(report, null, 2)
        : `llama\t${report.status}\t${pid ?? ""}`,
    );
  });

const readDelta = (
  dependencies: NativeDependencies,
  file: string,
  offset: number,
): Effect.Effect<number, NativeLifecycleError> =>
  Effect.gen(function* () {
    if (!(yield* dependencies.fileSystem.exists(file))) return offset;
    const content: string = yield* dependencies.fileSystem.readFileString(file);
    const startOffset: number = Math.min(offset, content.length);
    if (content.length > startOffset) {
      yield* Console.log(content.slice(startOffset));
    }
    return content.length;
  });

const logs = (
  dependencies: NativeDependencies,
): Effect.Effect<void, NativeLifecycleError> =>
  Effect.gen(function* () {
    let outputOffset = 0;
    let errorOffset = 0;
    yield* Effect.forever(
      Effect.gen(function* () {
        outputOffset = yield* readDelta(
          dependencies,
          Native.files.outputLog,
          outputOffset,
        );
        errorOffset = yield* readDelta(
          dependencies,
          Native.files.errorLog,
          errorOffset,
        );
        yield* Effect.sleep("1 second");
      }),
    );
  });

export { logs, start, status, stop };
