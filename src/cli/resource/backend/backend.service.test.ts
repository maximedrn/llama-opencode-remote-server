import { describe, expect, test } from "bun:test";
import { Backends } from "@app/cli/resource/backend/backend.constants.ts";
import type { BackendApi } from "@app/cli/resource/backend/backend.interface.ts";
import { BackendService } from "@app/cli/resource/backend/backend.service.ts";
import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import { HostService } from "@app/cli/system/host/host.service.ts";
import { FileSystem } from "@effect/platform";
import { Effect, Either, Layer } from "effect";

const hostLayer = (platform: string): Layer.Layer<HostService> =>
  Layer.succeed(
    HostService,
    HostService.make({
      homeDirectory: Effect.succeed("/home/dev"),
      isPlatform: (candidate: string): boolean => candidate === platform,
      platform,
      threads: { batch: 1, generation: 1 },
    }),
  );

/** Only `exists` and `readFileString` are reached by the backend assertions. */
const fileSystemLayer = (
  devices: readonly string[],
): Layer.Layer<FileSystem.FileSystem> =>
  Layer.succeed(FileSystem.FileSystem, {
    exists: (path: string): Effect.Effect<boolean> =>
      Effect.succeed(devices.includes(path)),
    readFileString: (): Effect.Effect<string> => Effect.succeed("Linux"),
  } as unknown as FileSystem.FileSystem);

const evaluate = <A, E>(
  platform: string,
  devices: readonly string[],
  use: (backends: BackendApi) => Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const backends: BackendApi = yield* BackendService;
      return yield* use(backends).pipe(Effect.either);
    }).pipe(
      Effect.provide(
        BackendService.DefaultWithoutDependencies.pipe(
          Layer.provide(
            Layer.merge(hostLayer(platform), fileSystemLayer(devices)),
          ),
        ),
      ),
    ),
  );

describe("parse", () => {
  test("accepts the known backends", async () => {
    const results: readonly Either.Either<Backend, unknown>[] =
      await Promise.all(
        Backends.list.map(
          (backend: Backend): Promise<Either.Either<Backend, unknown>> =>
            evaluate("linux", [], (backends: BackendApi) =>
              backends.parse(backend),
            ),
        ),
      );
    expect(results).toEqual(Backends.list.map(Either.right));
  });

  test("rejects unknown backends", async () => {
    const result: Either.Either<Backend, unknown> = await evaluate(
      "linux",
      [],
      (backends: BackendApi) => backends.parse("tpu"),
    );
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("assertHost", () => {
  test("cpu is accepted on any platform", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "darwin",
      [],
      (backends: BackendApi) => backends.assertHost("cpu"),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("nvidia is rejected on macOS", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "darwin",
      [],
      (backends: BackendApi) => backends.assertHost("nvidia"),
    );
    expect(Either.isLeft(result)).toBe(true);
  });

  test("nvidia is accepted on linux", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "linux",
      [],
      (backends: BackendApi) => backends.assertHost("nvidia"),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("amd is rejected on macOS", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "darwin",
      [],
      (backends: BackendApi) => backends.assertHost("amd"),
    );
    expect(Either.isLeft(result)).toBe(true);
  });

  test("amd is accepted on a non-WSL linux kernel", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "linux",
      [],
      (backends: BackendApi) => backends.assertHost("amd"),
    );
    expect(Either.isRight(result)).toBe(true);
  });
});

describe("assertDevices", () => {
  test("cpu needs no devices", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "linux",
      [],
      (backends: BackendApi) => backends.assertDevices("cpu"),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("amd requires both ROCm devices", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "linux",
      Backends.rocmDevices,
      (backends: BackendApi) => backends.assertDevices("amd"),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("amd reports a missing ROCm device", async () => {
    const result: Either.Either<void, unknown> = await evaluate(
      "linux",
      ["/dev/kfd"],
      (backends: BackendApi) => backends.assertDevices("amd"),
    );
    expect(Either.isLeft(result)).toBe(true);
  });
});
