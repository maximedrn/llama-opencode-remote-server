import { describe, expect, test } from "bun:test";
import { configuration } from "@app/cli/resource/native/native.helpers.ts";
import type {
  NativeConfig,
  NativeState,
} from "@app/cli/resource/native/native.types.ts";
import {
  decodeState,
  matchesProcess,
  positiveInteger,
  serverArgs,
} from "@app/cli/resource/native/native.utils.ts";
import { Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { parse } from "envfile";

const config: NativeConfig = {
  alias: "qwen",
  cacheK: "q8_0",
  cacheV: "q8_0",
  context: 32_768,
  device: "Vulkan0",
  flashAttention: "auto",
  modelArgs: [],
  modelPath: "D:/Models/my qwen.gguf",
  port: 8080,
  serverPath: "C:/Llama/llama-server.exe",
};

describe("native server arguments", () => {
  test("binds only loopback and keeps a path with spaces intact", () => {
    const args: readonly string[] = serverArgs(
      config,
      "C:/Repo/secrets/.llama_api_key",
    );
    expect(args.at(args.indexOf("--host") + 1)).toBe("127.0.0.1");
    expect(args.at(args.indexOf("-m") + 1)).toBe(config.modelPath);
    expect(args.at(args.indexOf("--device") + 1)).toBe("Vulkan0");
    expect(args).toContain("--jinja");
  });

  test("passes shared .env settings to the HIP executable", async () => {
    const loaded: NativeConfig = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* configuration(
          {
            readRaw: Effect.succeed(
              parse(`
NATIVE_SERVER_PATH="/Program Files/Llama/llama-server.exe"
DEVICE=ROCm1
CTX_SIZE=65536
LOCAL_PORT=9080
BATCH_SIZE=1024
UBATCH_SIZE=256
THREADS=6
THREADS_BATCH=10
FIT_TARGET=1024
LOAD_MODE=mmap
FLASH_ATTN=off
CACHE_TYPE_K=f16
CACHE_TYPE_V=q8_0
SPEC_DRAFT_N_MAX=5
`),
            ),
            requireModel: Effect.succeed({
              directory: "/models",
              file: "phi.gguf",
            }),
          },
          yield* Path.Path,
          "hip",
        );
      }).pipe(Effect.provide(Path.layer)),
    );
    const args: readonly string[] = serverArgs(loaded, "key");
    expect(loaded.serverPath).toBe("/Program Files/Llama/llama-server.exe");
    for (const pair of [
      ["--device", "ROCm1"],
      ["--ctx-size", "65536"],
      ["--port", "9080"],
      ["--batch-size", "1024"],
      ["--ubatch-size", "256"],
      ["--threads", "6"],
      ["--threads-batch", "10"],
      ["--fit-target", "1024"],
      ["--fit-ctx", "65536"],
      ["--load-mode", "mmap"],
      ["--flash-attn", "off"],
      ["--cache-type-k", "f16"],
      ["--cache-type-v", "q8_0"],
      ["--spec-ngram-simple-size-m", "5"],
    ] as const) {
      expect(args).toContain(pair[0]);
      expect(args.at(args.indexOf(pair[0]) + 1)).toBe(pair[1]);
    }
  });
});

describe("native process safety", () => {
  const state: NativeState = {
    pid: 1234,
    serverPath: "C:/Llama/llama-server.exe",
  };

  test("rejects unrelated process names even with the same PID", () => {
    expect(
      matchesProcess('"other.exe","1234","Console","1","16,000 K"', state),
    ).toBe(false);
  });

  test("recognizes the expected image and PID", () => {
    expect(
      matchesProcess(
        '"llama-server.exe","1234","Console","1","16,000 K"',
        state,
      ),
    ).toBe(true);
  });

  test("decodes valid state", () => {
    expect(decodeState(JSON.stringify(state))).toEqual(Option.some(state));
  });

  test("rejects invalid process IDs", () => {
    for (const pid of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, "1234"]) {
      expect(decodeState(JSON.stringify({ ...state, pid }))).toEqual(
        Option.none(),
      );
    }
  });

  test("rejects an empty executable path", () => {
    expect(decodeState(JSON.stringify({ ...state, serverPath: "" }))).toEqual(
      Option.none(),
    );
  });

  test("rejects malformed JSON state", () => {
    expect(decodeState('{"pid":')).toEqual(Option.none());
  });

  test("rejects nonnumeric context sizes", () => {
    expect((): number => positiveInteger("32K", "CTX_SIZE")).toThrow();
  });
});
