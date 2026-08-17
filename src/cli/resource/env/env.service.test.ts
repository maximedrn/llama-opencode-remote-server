import { describe, expect, test } from "bun:test";
import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import { makeStackEnv } from "@app/cli/resource/env/env.factory.ts";
import type {
  ClientEnv,
  EnvRecord,
  StackEnv,
} from "@app/cli/resource/env/env.types.ts";
import {
  cleanStackEnv,
  clientEnvConfig,
  missingKeys,
  stackEnvConfig,
} from "@app/cli/resource/env/env.utils.ts";
import { ConfigProvider, Effect, Option } from "effect";

const emptyStackEnv: StackEnv = {
  backend: Option.none(),
  composeFile: Option.none(),
  keepalive: Option.none(),
  localPort: Option.none(),
  modelAlias: Option.none(),
  modelDirectory: Option.none(),
  modelFile: Option.none(),
};

const readStackEnv = (values: ReadonlyMap<string, string>): Promise<StackEnv> =>
  Effect.runPromise(
    Effect.withConfigProvider(
      stackEnvConfig,
      ConfigProvider.fromMap(new Map(values)),
    ),
  );

describe("stackEnvConfig", () => {
  test("an empty environment is all-None", async () => {
    expect(await readStackEnv(new Map())).toEqual(emptyStackEnv);
  });

  test("blank values are discarded, filled values kept", async () => {
    expect(
      await readStackEnv(
        new Map<string, string>([
          [EnvFile.keys.backend, "cpu"],
          [EnvFile.keys.localPort, "   "],
          [EnvFile.keys.modelFile, "phi-3.gguf"],
        ]),
      ),
    ).toEqual({
      ...emptyStackEnv,
      backend: Option.some("cpu"),
      modelFile: Option.some("phi-3.gguf"),
    });
  });

  test("reads the custom compose file", async () => {
    const env: StackEnv = await readStackEnv(
      new Map<string, string>([
        [EnvFile.keys.composeFile, "docker/docker-compose.rig.yaml"],
      ]),
    );
    expect(env.composeFile).toEqual(
      Option.some("docker/docker-compose.rig.yaml"),
    );
  });
});

describe("cleanStackEnv", () => {
  test("discards blank values, keeps filled ones", () => {
    expect(
      cleanStackEnv({
        ...emptyStackEnv,
        backend: Option.some("cpu"),
        localPort: Option.some("   "),
        modelDirectory: Option.some("/models"),
      }),
    ).toEqual({
      ...emptyStackEnv,
      backend: Option.some("cpu"),
      modelDirectory: Option.some("/models"),
    });
  });
});

describe("clientEnvConfig", () => {
  test("parses the client variables", async () => {
    const env: ClientEnv = await Effect.runPromise(
      Effect.withConfigProvider(
        clientEnvConfig,
        ConfigProvider.fromMap(
          new Map<string, string>([
            ["LLAMA_API_KEY", "llama_test"],
            ["LLAMA_BASE_URL", "http://127.0.0.1:8080"],
          ]),
        ),
      ),
    );
    expect(env.apiKey).toEqual(Option.some("llama_test"));
    expect(env.baseUrl).toEqual(Option.some("http://127.0.0.1:8080"));
    expect(env.accessClientId).toEqual(Option.none());
  });
});

describe("missingKeys", () => {
  test("lists the model variables that are absent", () => {
    expect(missingKeys(emptyStackEnv)).toEqual([
      EnvFile.keys.modelDirectory,
      EnvFile.keys.modelFile,
    ]);
  });
});

describe("makeStackEnv", () => {
  test("writes runtime, backend and model variables, but no image tag", () => {
    expect(
      makeStackEnv({
        backend: "cpu",
        existing: {},
        keepalive: false,
        model: { directory: "/models", file: "phi-3-7b.gguf" },
        threads: { batch: 8, generation: 4 },
      }),
    ).toEqual({
      ...Object.fromEntries(EnvFile.runtime),
      [EnvFile.keys.backend]: "cpu",
      [EnvFile.keys.keepalive]: "",
      [EnvFile.keys.batchThreads]: "8",
      [EnvFile.keys.generationThreads]: "4",
      [EnvFile.keys.modelAlias]: "phi-3-7b",
      [EnvFile.keys.modelDirectory]: "/models",
      [EnvFile.keys.modelFile]: "phi-3-7b.gguf",
    });
  });
});

describe("makeStackEnv merging", () => {
  test("keeps a pinned image and every other hand-tuned value", () => {
    const written: EnvRecord = makeStackEnv({
      backend: "amd",
      existing: {
        [EnvFile.keys.llamaImage]: "my-llama:custom",
        // biome-ignore lint/style/useNamingConvention: Compose variable name.
        CTX_SIZE: "131072",
      },
      keepalive: false,
      model: { directory: "/models", file: "phi.gguf" },
      threads: { batch: 8, generation: 4 },
    });
    expect(written[EnvFile.keys.llamaImage]).toBe("my-llama:custom");
    expect(written.CTX_SIZE).toBe("131072");
  });

  test("still refreshes the variables init owns", () => {
    const written: EnvRecord = makeStackEnv({
      backend: "amd",
      existing: {
        [EnvFile.keys.backend]: "cpu",
        [EnvFile.keys.modelFile]: "stale.gguf",
      },
      keepalive: true,
      model: { directory: "/models", file: "phi.gguf" },
      threads: { batch: 8, generation: 4 },
    });
    expect(written[EnvFile.keys.backend]).toBe("amd");
    expect(written[EnvFile.keys.modelFile]).toBe("phi.gguf");
    expect(written[EnvFile.keys.keepalive]).toBe(EnvFile.enabled);
  });
});
