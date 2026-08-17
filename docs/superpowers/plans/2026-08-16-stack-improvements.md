# Stack Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden and extend the `stack` CLI — a unit-test foundation (`bun test`), reliable failure modes (typed errors instead of `orDie`, captured stderr, atomic model downloads, a health wait after rotate-key, `init` overwrite protection, distinct HTTP errors), new operations (`doctor`, `health`, `models`, `uninstall`, richer `status`/`logs`), and a quality pass (no unsafe casts, docs, spell-check).

**Architecture:** Keep the existing Effect-services-per-domain layout (`src/<domain>/{constants,interface,service,types,utils}.ts`). New files: `src/docker/docker.utils.ts` (composeArgs, extracted), `src/stack/commands.ts` (shared command builders + new subcommands), `src/stack/rotate.ts` (rotate-key + health wait), `src/stack/doctor.ts`, `src/stack/uninstall.ts`. Tests are co-located `src/**/*.test.ts` — typechecked by `tsc --noEmit` (tsconfig `include: ["src"]`), linted by biome, run by `bun test`, gated by lefthook (`check`/`pre-commit`) and CI.

**Tech Stack:** Bun ≥1.3.14, TypeScript strict (`noUncheckedIndexedAccess`), Effect 3.22.1, @effect/cli 0.77, @effect/platform 0.97.1, `bun:test`, biome, cspell, lefthook, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-16-stack-improvements-design.md`

**Global constraints (apply to every task):**
- Imports must use `@app/*` aliases (biome forbids relative imports); import specifiers carry the `.ts` extension, e.g. `@app/stack/stack.utils.ts`.
- Max 300 lines/file, 60 lines/function, max 6 params; no default exports; explicit types on declarations (biome `style/useExplicitType`); `bun run format`/`lint` run automatically on commit via lefthook.
- New errors follow the `Data.TaggedError` pattern with a `message` getter built from a constants message function.
- Each task ends with green `bun test` + `bun run typecheck` and a conventional commit (`test:` / `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`).

---

## Tier 0 — Test foundation

### Task 1: `bun test` script + first test (composeArgs)

**Files:**
- Modify: `package.json`
- Create: `src/docker/docker.utils.ts`, `src/docker/docker.utils.test.ts`
- Modify: `src/docker/docker.service.ts`

- [ ] **Step 1: Add the test script**

In `package.json` scripts, between `"stack"` and `"typecheck"`:

```json
    "stack": "bun run src/main.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 2: Write the failing test**

Create `src/docker/docker.utils.test.ts`:

```ts
import { composeArgs } from "@app/docker/docker.utils.ts";
import { Project } from "@app/project/project.constants.ts";
import { describe, expect, test } from "bun:test";

const root: string = Project.root;

describe("composeArgs", () => {
  test("remote stack selects the edge profile without the local file", () => {
    expect(composeArgs("cpu", {})).toEqual([
      "compose",
      "--project-directory",
      root,
      "--profile",
      "edge",
      "-f",
      "docker/docker-compose.yaml",
      "-f",
      "docker/docker-compose.cpu.yaml",
    ]);
  });

  test("local stack drops the edge profile and appends the local file", () => {
    expect(composeArgs("nvidia", { local: true })).toEqual([
      "compose",
      "--project-directory",
      root,
      "-f",
      "docker/docker-compose.yaml",
      "-f",
      "docker/docker-compose.nvidia.yaml",
      "-f",
      "docker/docker-compose.local.yaml",
    ]);
  });

  test("each backend resolves its own compose file", () => {
    expect(composeArgs("amd", {}).at(-1)).toBe("docker/docker-compose.amd.yaml");
    expect(composeArgs("cpu", {}).at(-1)).toBe("docker/docker-compose.cpu.yaml");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/docker/docker.utils.test.ts`
Expected: FAIL — cannot resolve `@app/docker/docker.utils.ts`.

- [ ] **Step 4: Extract composeArgs**

Create `src/docker/docker.utils.ts`, moving the local `composeArgs` (and its doc comment) from `src/docker/docker.service.ts` verbatim:

```ts
import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import { Project } from "@app/project/project.constants.ts";

/**
 * The project directory is pinned to the repository root so the `./nginx` and
 * `./secrets` bind mounts stay resolvable from `docker/`.
 */
const composeArgs = (
  backend: Backend,
  options: ComposeOptions,
): readonly string[] => [
  Docker.compose.subcommand,
  Docker.flags.projectDirectory,
  Project.root,
  ...(options.local === true
    ? []
    : [Docker.flags.profile, Docker.profiles.edge]),
  Docker.flags.file,
  Docker.compose.baseFile,
  Docker.flags.file,
  Docker.compose.backendFile(backend),
  ...(options.local === true
    ? [Docker.flags.file, Docker.compose.localFile]
    : []),
];

export { composeArgs };
```

In `src/docker/docker.service.ts`: delete the local `composeArgs` (lines 14–35 incl. doc comment), drop the now-unused `Project` import, add `import { composeArgs } from "@app/docker/docker.utils.ts";`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/docker/docker.utils.test.ts` → Expected: PASS (3 tests).
Run: `bun run typecheck` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json src/docker
git commit -m "test: add bun test script and composeArgs coverage"
```

---

### Task 2: Wire tests into lefthook and CI

**Files:**
- Modify: `lefthook.yml`
- Modify: `.github/workflows/validate.yml`

- [ ] **Step 1: Add the test command to lefthook**

In `lefthook.yml`, add to the `pre-commit` `commands:` block:

```yaml
    test:
      glob: "src/**/*.ts"
      run: bun test
```

and to the `check` `commands:` block:

```yaml
    test:
      run: bun test
```

- [ ] **Step 2: Add the test step to CI**

In `.github/workflows/validate.yml`, after the `Code integrity checks` step:

```yaml
      - name: Run unit tests
        run: bun test
```

- [ ] **Step 3: Verify**

Run: `bun run validate` → Expected: lint, typecheck, spell and the new `test` command all pass.

- [ ] **Step 4: Commit**

```bash
git add lefthook.yml .github/workflows/validate.yml
git commit -m "chore: gate bun test in lefthook and CI"
```

---

### Task 3: Test model.utils

**Files:**
- Create: `src/model/model.utils.test.ts`

Characterization tests for existing pure functions — they should pass immediately; if one fails, fix the test to document the actual behavior.

- [ ] **Step 1: Write the tests**

Create `src/model/model.utils.test.ts`:

```ts
import {
  defaultModelDirectory,
  fileNameFromUrl,
  modelAlias,
  toPosixPath,
} from "@app/model/model.utils.ts";
import { describe, expect, test } from "bun:test";
import { Option } from "effect";

const orEmpty = (name: Option.Option<string>): string =>
  Option.getOrElse(name, (): string => "");

describe("toPosixPath", () => {
  test("replaces backslashes with slashes", () => {
    expect(toPosixPath("C:\\dev\\.llama\\models")).toBe(
      "C:/dev/.llama/models",
    );
  });
});

describe("defaultModelDirectory", () => {
  test("joins the home directory with .llama/models", () => {
    expect(defaultModelDirectory("/Users/dev")).toBe("/Users/dev/.llama/models");
  });
});

describe("fileNameFromUrl", () => {
  test("keeps the last path segment ending in .gguf", () => {
    expect(
      orEmpty(fileNameFromUrl("https://example.org/models/phi-3-7b.gguf")),
    ).toBe("phi-3-7b.gguf");
  });

  test("ignores query strings and fragments", () => {
    expect(
      orEmpty(
        fileNameFromUrl("https://example.org/m/qwen2-0.5b.gguf?token=abc#v1"),
      ),
    ).toBe("qwen2-0.5b.gguf");
  });

  test("rejects names without the .gguf extension", () => {
    expect(
      Option.isNone(fileNameFromUrl("https://example.org/m/archive.zip")),
    ).toBe(true);
  });

  test("normalizes Windows separators", () => {
    expect(orEmpty(fileNameFromUrl("https:\\example\\model.gguf"))).toBe(
      "model.gguf",
    );
  });
});

describe("modelAlias", () => {
  test("strips the .gguf extension of the basename", () => {
    expect(modelAlias("/models/phi-3-7b.gguf")).toBe("phi-3-7b");
  });

  test("keeps names without the extension as-is", () => {
    expect(modelAlias("plain-name")).toBe("plain-name");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test src/model/model.utils.test.ts` → Expected: PASS (8 tests). If any assertion fails, compare with `src/model/model.utils.ts` and correct the test.

- [ ] **Step 3: Commit**

```bash
git add src/model/model.utils.test.ts
git commit -m "test: cover model.utils pure helpers"
```

---

### Task 4: Test model.factory (makeModelSource)

**Files:**
- Create: `src/model/model.factory.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/model/model.factory.test.ts`:

```ts
import { makeModelSource } from "@app/model/model.factory.ts";
import { describe, expect, test } from "bun:test";
import { Effect, Either, Option } from "effect";
import type { ModelSource } from "@app/model/model.types.ts";
import { ModelSourceError } from "@app/model/model.types.ts";

interface SourceOptions {
  readonly include?: Option.Option<string>;
  readonly modelFile?: Option.Option<string>;
  readonly modelUrl?: Option.Option<string>;
  readonly repository?: Option.Option<string>;
}

const evaluate = (
  options: SourceOptions,
): Either.Either<ModelSource, ModelSourceError> =>
  Effect.runSync(
    Effect.either(
      makeModelSource({
        include: Option.none(),
        modelFile: Option.none(),
        modelUrl: Option.none(),
        repository: Option.none(),
        ...options,
      }),
    ),
  );

describe("makeModelSource", () => {
  test("accepts a single local file", () => {
    expect(evaluate({ modelFile: Option.some("/models/phi.gguf") })).toEqual(
      Either.right({ kind: "LocalFile", path: "/models/phi.gguf" }),
    );
  });

  test("accepts a single download url", () => {
    expect(
      evaluate({
        modelUrl: Option.some("https://example.org/qwen2.gguf"),
      }),
    ).toEqual(
      Either.right({
        kind: "DownloadUrl",
        url: "https://example.org/qwen2.gguf",
      }),
    );
  });

  test("defaults the Hugging Face include glob to *", () => {
    expect(evaluate({ repository: Option.some("org/repo") })).toEqual(
      Either.right({
        include: "*",
        kind: "HuggingFace",
        repository: "org/repo",
      }),
    );
  });

  test("keeps an explicit include glob", () => {
    expect(
      evaluate({
        include: Option.some("**/*.gguf"),
        repository: Option.some("org/repo"),
      }),
    ).toEqual(
      Either.right({
        include: "**/*.gguf",
        kind: "HuggingFace",
        repository: "org/repo",
      }),
    );
  });

  test("rejects zero sources", () => {
    expect(evaluate({})).toBeInstanceOf(Either.Left);
  });

  test("rejects two sources and counts them", () => {
    const result = evaluate({
      modelFile: Option.some("/models/phi.gguf"),
      modelUrl: Option.some("https://example.org/qwen2.gguf"),
    });
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(ModelSourceError);
      expect(result.left.given).toBe(2);
    }
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test src/model/model.factory.test.ts` → Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add src/model/model.factory.test.ts
git commit -m "test: cover makeModelSource"
```

---

### Task 5: Test model.helpers (resolveModel)

**Files:**
- Create: `src/model/model.helpers.test.ts`

Covers the three resolution strategies with the real `FileSystem`/`Path` (via `BunContext.layer`), a `Bun.serve` local server for downloads, and a fake `ProcessApi` for Hugging Face.

- [ ] **Step 1: Write the tests**

Create `src/model/model.helpers.test.ts`:

```ts
import { resolveModel } from "@app/model/model.helpers.ts";
import { afterAll, describe, expect, test } from "bun:test";
import { BunContext } from "@effect/platform-bun";
import { FileSystem, Path } from "@effect/platform";
import { Effect, Either } from "effect";
import type { ProcessApi } from "@app/process/process.interface.ts";
import type { ModelSource } from "@app/model/model.types.ts";
import {
  HuggingFaceCliMissingError,
  ModelDownloadError,
  ModelNotFoundError,
} from "@app/model/model.types.ts";

interface Deps {
  fileSystem: FileSystem.FileSystem;
  path: Path.Path;
  processes: ProcessApi;
}

const scratch: string = "/tmp/llama-stack-test";
const at = (name: string): string => `${scratch}/${name}`;

const stubProcesses = (overrides?: Partial<ProcessApi>): ProcessApi => ({
  run: () => Effect.succeed(undefined),
  succeeds: () => Effect.succeed(false),
  ...overrides,
});

const evaluate = <A, E>(
  processes: ProcessApi,
  use: (deps: Deps) => Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const deps: Deps = {
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        processes,
      };
      return yield* use(deps).pipe(Effect.either);
    }).pipe(Effect.provide(BunContext.layer)),
  );

const writeFile = (path: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.makeDirectory(path.slice(0, path.lastIndexOf("/")), {
      recursive: true,
    });
    yield* fileSystem.writeFileString(path, "model-bytes");
  }).pipe(Effect.provide(BunContext.layer));

afterAll(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.remove(scratch, { force: true, recursive: true });
    }).pipe(Effect.provide(BunContext.layer)),
  );
});

describe("resolveModel", () => {
  test("resolves an existing local file", async () => {
    await writeFile(at("local/model.gguf"));
    const result = await evaluate(stubProcesses(), (deps) =>
      resolveModel(deps, {
        directory: at("local"),
        source: { kind: "LocalFile", path: "model.gguf" },
      }),
    );
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toEqual({
        directory: at("local"),
        file: "model.gguf",
      });
    }
  });

  test("fails with ModelFileMissingError when the local file is absent", async () => {
    const result = await evaluate(stubProcesses(), (deps) =>
      resolveModel(deps, {
        directory: at("local"),
        source: { kind: "LocalFile", path: "absent.gguf" },
      }),
    );
    expect(Either.isLeft(result)).toBe(true);
  });

  test("writes the download under the url file name", async () => {
    const server = Bun.serve({
      fetch: (): Response => new Response("model-bytes"),
      port: 49917,
    });
    const dir: string = at("dl");
    const result = await evaluate(stubProcesses(), (deps) =>
      Effect.gen(function* () {
        const outcome = yield*
          resolveModel(deps, {
            directory: dir,
            source: {
              kind: "DownloadUrl",
              url: `http://127.0.0.1:${server.port}/phi-3.gguf`,
            },
          }).pipe(Effect.either);
        return {
          exists: yield* deps.fileSystem.exists(`${dir}/phi-3.gguf`),
          outcome,
          partial: yield* deps.fileSystem.exists(`${dir}/phi-3.gguf.part`),
        };
      }),
    );
    server.stop();
    expect(Either.isRight(result.outcome)).toBe(true);
    expect(result.exists).toBe(true);
    expect(result.partial).toBe(false);
  });

  test("fails with ModelDownloadError on an HTTP error and leaves no file", async () => {
    const server = Bun.serve({
      fetch: (): Response => new Response("bad", { status: 500 }),
      port: 49917,
    });
    const dir: string = at("dl-fail");
    const result = await evaluate(stubProcesses(), (deps) =>
      Effect.gen(function* () {
        const outcome = yield*
          resolveModel(deps, {
            directory: dir,
            source: {
              kind: "DownloadUrl",
              url: `http://127.0.0.1:${server.port}/phi-3.gguf`,
            },
          }).pipe(Effect.either);
        return {
          exists: yield* deps.fileSystem.exists(`${dir}/phi-3.gguf`),
          outcome,
          partial: yield* deps.fileSystem.exists(`${dir}/phi-3.gguf.part`),
        };
      }),
    );
    server.stop();
    expect(Either.isLeft(result.outcome)).toBe(true);
    if (Either.isLeft(result.outcome)) {
      expect(result.outcome.left).toBeInstanceOf(ModelDownloadError);
    }
    expect(result.exists).toBe(false);
    expect(result.partial).toBe(false);
  });

  test("rejects urls whose last segment is not a .gguf file", async () => {
    const result = await evaluate(stubProcesses(), (deps) =>
      resolveModel(deps, {
        directory: at("dl"),
        source: {
          kind: "DownloadUrl",
          url: "http://127.0.0.1:49917/does-not-end-in-gguf",
        },
      }),
    );
    expect(Either.isLeft(result)).toBe(true);
  });

  test("prefers an already-downloaded Hugging Face model", async () => {
    await writeFile(at("hf/phi.gguf"));
    const result = await evaluate(stubProcesses(), (deps) =>
      resolveModel(deps, {
        directory: at("hf"),
        source: { include: "*.gguf", kind: "HuggingFace", repository: "org/phi" },
      }),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("downloads via hf when no local match exists", async () => {
    const dir: string = at("hf-dl");
    const processes: ProcessApi = {
      run: (): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* writeFile(`${dir}/phi.gguf`);
        }),
      succeeds: (executable: string): Effect.Effect<boolean> =>
        Effect.succeed(executable === "hf"),
    };
    const result = await evaluate(processes, (deps) =>
      resolveModel(deps, {
        directory: dir,
        source: { include: "*.gguf", kind: "HuggingFace", repository: "org/phi" },
      }),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("fails with HuggingFaceCliMissingError when hf is absent", async () => {
    const result = await evaluate(stubProcesses(), (deps) =>
      resolveModel(deps, {
        directory: at("hf"),
        source: { include: "*.gguf", kind: "HuggingFace", repository: "org/phi" },
      }),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(HuggingFaceCliMissingError);
    }
  });

  test("fails with ModelNotFoundError when the download produces no file", async () => {
    const dir: string = at("hf-missing");
    const processes: ProcessApi = {
      run: (): Effect.Effect<void> => Effect.void,
      succeeds: (executable: string): Effect.Effect<boolean> =>
        Effect.succeed(executable === "hf"),
    };
    const result = await evaluate(processes, (deps) =>
      resolveModel(deps, {
        directory: dir,
        source: { include: "*.gguf", kind: "HuggingFace", repository: "org/phi" },
      }),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(ModelNotFoundError);
    }
  });
});
```

Notes for the implementer:
- `resolveModel` takes `{directory, source}` where `source` is a `ModelSource` (see `src/model/model.types.ts`).
- The `hf-dl` test's fake `run` writes the model file to simulate `hf download`; the real helper then re-scans and finds it.
- `stubProcesses`'s default `succeeds: false` makes the Hugging Face "absent" path reachable; the success path passes `executable === "hf"`.

- [ ] **Step 2: Run the tests**

Run: `bun test src/model/model.helpers.test.ts` → Expected: PASS (9 tests).

- [ ] **Step 3: Commit**

```bash
git add src/model/model.helpers.test.ts
git commit -m "test: cover resolveModel strategies"
```

---

### Task 6: Extract env configs into env.utils + test env parsing

**Files:**
- Create: `src/env/env.utils.ts`
- Modify: `src/env/env.service.ts`
- Create: `src/env/env.service.test.ts`

- [ ] **Step 1: Extract the parsing helpers**

Move from `src/env/env.service.ts` into `src/env/env.utils.ts` (exported): `optionalString`, `isFilled`, `withoutBlanks`, `stackEnvConfig`, `clientEnvConfig`, `missingKeys`. Then in `src/env/env.service.ts` import them from `@app/env/env.utils.ts` and delete the locals. Keep `provider`/`readFile` in the service.

- [ ] **Step 2: Write the tests**

Create `src/env/env.service.test.ts`:

```ts
import {
  clientEnvConfig,
  missingKeys,
  stackEnvConfig,
} from "@app/env/env.utils.ts";
import { makeStackEnv } from "@app/env/env.factory.ts";
import { EnvFile } from "@app/env/env.constants.ts";
import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Option } from "effect";
import type { StackEnv } from "@app/env/env.types.ts";
import type { ClientEnv } from "@app/env/env.types.ts";

describe("stackEnvConfig", () => {
  test("an empty environment is all-None", async () => {
    const env: StackEnv = await Effect.runPromise(
      Effect.withConfigProvider(
        stackEnvConfig,
        ConfigProvider.fromMap(new Map()),
      ),
    );
    expect(env).toEqual({
      backend: Option.none(),
      localPort: Option.none(),
      modelAlias: Option.none(),
      modelDirectory: Option.none(),
      modelFile: Option.none(),
    });
  });

  test("blank values are discarded, filled values kept", async () => {
    const env: StackEnv = await Effect.runPromise(
      Effect.withConfigProvider(
        stackEnvConfig,
        ConfigProvider.fromMap(
          new Map<string, string>([
            ["BACKEND", "cpu"],
            ["LOCAL_PORT", "   "],
            ["MODEL_FILE", "phi-3.gguf"],
          ]),
        ),
      ),
    );
    expect(env).toEqual({
      backend: Option.some("cpu"),
      localPort: Option.none(),
      modelAlias: Option.none(),
      modelDirectory: Option.none(),
      modelFile: Option.some("phi-3.gguf"),
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
    expect(
      missingKeys({
        backend: Option.none(),
        localPort: Option.none(),
        modelAlias: Option.none(),
        modelDirectory: Option.none(),
        modelFile: Option.none(),
      }),
    ).toEqual([EnvFile.keys.modelDirectory, EnvFile.keys.modelFile]);
  });
});

describe("makeStackEnv", () => {
  test("writes runtime, images, backend and model variables", () => {
    expect(
      makeStackEnv({
        backend: "cpu",
        model: { directory: "/models", file: "phi-3-7b.gguf" },
        threads: { batch: 8, generation: 4 },
      }),
    ).toEqual({
      ...Object.fromEntries(EnvFile.images),
      ...Object.fromEntries(EnvFile.runtime),
      [EnvFile.keys.backend]: "cpu",
      [EnvFile.keys.batchThreads]: "8",
      [EnvFile.keys.generationThreads]: "4",
      [EnvFile.keys.modelAlias]: "phi-3-7b",
      [EnvFile.keys.modelDirectory]: "/models",
      [EnvFile.keys.modelFile]: "phi-3-7b.gguf",
    });
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `bun test src/env/env.service.test.ts` → Expected: PASS (5 tests).

- [ ] **Step 4: Commit**

```bash
git add src/env
git commit -m "test: cover env config parsing and makeStackEnv"
```

---

### Task 7: Test backend.service

**Files:**
- Create: `src/backend/backend.service.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/backend/backend.service.test.ts`:

```ts
import { BackendService } from "@app/backend/backend.service.ts";
import { Backends } from "@app/backend/backend.constants.ts";
import { HostService } from "@app/host/host.service.ts";
import { describe, expect, test } from "bun:test";
import { BunContext } from "@effect/platform-bun";
import { FileSystem } from "@effect/platform";
import { Effect, Either, Layer } from "effect";
import type { BackendApi } from "@app/backend/backend.interface.ts";

const hostLayer = (platform: string): Layer.Layer<HostService> =>
  Layer.succeed(HostService, {
    homeDirectory: Effect.succeed("/home/dev"),
    isPlatform: (candidate: string): boolean => candidate === platform,
    platform,
    threads: { batch: 1, generation: 1 },
  });

const evaluate = <A, E>(
  platform: string,
  use: (backends: BackendApi) => Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const backends: BackendService = yield* BackendService;
      return yield* use(backends).pipe(Effect.either);
    }).pipe(
      Effect.provide(Layer.merge(hostLayer(platform), BunContext.layer)),
    ),
  );

const fakeFileSystem = (
  devices: readonly string[],
): FileSystem.FileSystem =>
  ({
    exists: (path: string): Effect.Effect<boolean> =>
      Effect.succeed(devices.includes(path)),
  }) as unknown as FileSystem.FileSystem;

describe("parse", () => {
  test("accepts the known backends", async () => {
    for (const backend of Backends.list) {
      const result = await evaluate("linux", (b) => b.parse(backend));
      expect(result).toEqual(Either.right(backend));
    }
  });

  test("rejects unknown backends", async () => {
    const result = await evaluate("linux", (b) => b.parse("tpu"));
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("assertHost", () => {
  test("cpu is accepted on any platform", async () => {
    const result = await evaluate("darwin", (b) => b.assertHost("cpu"));
    expect(Either.isRight(result)).toBe(true);
  });

  test("nvidia is rejected on macOS", async () => {
    const result = await evaluate("darwin", (b) => b.assertHost("nvidia"));
    expect(Either.isLeft(result)).toBe(true);
  });

  test("nvidia is accepted on linux", async () => {
    const result = await evaluate("linux", (b) => b.assertHost("nvidia"));
    expect(Either.isRight(result)).toBe(true);
  });

  test("amd is rejected on macOS", async () => {
    const result = await evaluate("darwin", (b) => b.assertHost("amd"));
    expect(Either.isLeft(result)).toBe(true);
  });

  test("amd is accepted on a non-WSL linux kernel", async () => {
    const result = await evaluate("linux", (b) => b.assertHost("amd"));
    expect(Either.isRight(result)).toBe(true);
  });
});

describe("assertDevices", () => {
  test("cpu needs no devices", async () => {
    const result = await evaluate("linux", (b) => b.assertDevices("cpu"));
    expect(Either.isRight(result)).toBe(true);
  });

  test("amd requires both ROCm devices", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const backends: BackendService = yield* BackendService;
        return yield* backends.assertDevices("amd").pipe(Effect.either);
      }).pipe(
        Effect.provide(
          Layer.merge(
            hostLayer("linux"),
            Layer.succeed(
              FileSystem.FileSystem,
              fakeFileSystem(["/dev/kfd", "/dev/dri"]),
            ),
          ),
        ),
      ),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("amd reports the first missing ROCm device", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const backends: BackendService = yield* BackendService;
        return yield* backends.assertDevices("amd").pipe(Effect.either);
      }).pipe(
        Effect.provide(
          Layer.merge(
            hostLayer("linux"),
            Layer.succeed(
              FileSystem.FileSystem,
              fakeFileSystem(["/dev/kfd"]),
            ),
          ),
        ),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test src/backend/backend.service.test.ts` → Expected: PASS (10 tests).

- [ ] **Step 3: Commit**

```bash
git add src/backend/backend.service.test.ts
git commit -m "test: cover backend parse, host and device assertions"
```

---

### Task 8: Test secret.utils

**Files:**
- Create: `src/secret/secret.utils.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/secret/secret.utils.test.ts`:

```ts
import { fingerprint, generateApiKey } from "@app/secret/secret.utils.ts";
import { Secrets } from "@app/secret/secret.constants.ts";
import { describe, expect, test } from "bun:test";
import { Either, Encoding } from "effect";

describe("generateApiKey", () => {
  test("is prefixed and base64url-encoded", () => {
    const key: string = generateApiKey();
    expect(key.startsWith(Secrets.apiKey.prefix)).toBe(true);
    const body: string = key.slice(Secrets.apiKey.prefix.length);
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    const bytes: Either.Either<Uint8Array, unknown> =
      Encoding.decodeBase64Url(body);
    expect(Either.isRight(bytes)).toBe(true);
    if (Either.isRight(bytes)) {
      expect(bytes.right.byteLength).toBe(Secrets.apiKey.byteLength);
    }
  });

  test("generates unique keys", () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});

describe("fingerprint", () => {
  test("is a 16-character hex digest and stable", () => {
    const value: string = fingerprint("llama_secret");
    expect(value).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint("llama_secret")).toBe(value);
    expect(fingerprint("other")).not.toBe(value);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test src/secret/secret.utils.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add src/secret/secret.utils.test.ts
git commit -m "test: cover api key generation and fingerprinting"
```

---

### Task 9: Test stack.utils

**Files:**
- Create: `src/stack/stack.utils.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/stack/stack.utils.test.ts`:

```ts
import {
  makeCompletionRequest,
  makeSmokeTarget,
} from "@app/stack/stack.utils.ts";
import { describe, expect, test } from "bun:test";
import { Effect, Either, Option } from "effect";
import { MissingClientConfigError } from "@app/stack/stack.types.ts";
import type { ClientEnv } from "@app/env/env.types.ts";

const client: ClientEnv = {
  accessClientId: Option.none(),
  accessClientSecret: Option.none(),
  apiKey: Option.some("llama_test"),
  baseUrl: Option.some("http://127.0.0.1:8080"),
};

describe("makeCompletionRequest", () => {
  test("builds the fixed smoke completion", () => {
    expect(makeCompletionRequest("phi-3-7b")).toEqual({
      max_tokens: 32,
      messages: [{ content: "Reply with exactly OK", role: "user" }],
      model: "phi-3-7b",
    });
  });
});

describe("makeSmokeTarget", () => {
  test("targets the chat completions endpoint", () => {
    const target = Effect.runSync(makeSmokeTarget(client, "phi-3-7b"));
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/chat/completions");
  });

  test("strips trailing slashes from the base url", () => {
    const target = Effect.runSync(
      makeSmokeTarget(
        { ...client, baseUrl: Option.some("http://127.0.0.1:8080///") },
        "m",
      ),
    );
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/chat/completions");
  });

  test("adds Access headers only when both variables are present", () => {
    const target = Effect.runSync(
      makeSmokeTarget(
        {
          ...client,
          accessClientId: Option.some("id"),
          accessClientSecret: Option.some("secret"),
        },
        "m",
      ),
    );
    expect(target.request.headers).toEqual({
      "CF-Access-Client-Id": "id",
      "CF-Access-Client-Secret": "secret",
    });
  });

  test("fails when the base url is missing", () => {
    const result = Effect.runSync(
      Effect.either(
        makeSmokeTarget({ ...client, baseUrl: Option.none() }, "m"),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MissingClientConfigError);
    }
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test src/stack/stack.utils.test.ts` → Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add src/stack/stack.utils.test.ts
git commit -m "test: cover smoke target construction"
```

---

## Tier 1 — Reliability

### Task 10: CommandFailedError carries captured stderr (`runCaptured`)

**Files:**
- Modify: `src/process/process.types.ts`
- Modify: `src/process/process.interface.ts`
- Modify: `src/process/process.service.ts`
- Modify: `src/process/process.constants.ts`
- Create: `src/process/process.service.test.ts`

Verified API notes (this Effect platform version):
- `executor.start(command)` → `Effect<CommandExecutor.Process, PlatformError, Scope>` — wrap with `Effect.scoped(...)`.
- There is **no** `Stream.runText`; collect with `Stream.runCollect` and decode the `Chunk<Uint8Array>` manually.
- `CommandExecutor.Process` is the type of the started process (`.stdout`/`.stderr` are `Stream<Uint8Array>`; `.exitCode` is `Effect<number>`).

- [ ] **Step 1: Write the failing test**

Create `src/process/process.service.test.ts`:

```ts
import { ProcessService } from "@app/process/process.service.ts";
import { describe, expect, test } from "bun:test";
import { BunContext } from "@effect/platform-bun";
import { Effect, Either, Layer } from "effect";
import type { ProcessApi } from "@app/process/process.interface.ts";
import { CommandFailedError } from "@app/process/process.types.ts";

const service: Layer.Layer<ProcessService> = Layer.merge(
  ProcessService.Default,
  BunContext.layer,
);

const withService = <A, E>(
  use: (processes: ProcessApi) => Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const processes: ProcessApi = yield* ProcessService;
      return yield* use(processes).pipe(Effect.either);
    }).pipe(Effect.provide(service)),
  );

describe("runCaptured", () => {
  test("returns stdout on success", async () => {
    const output = await withService((processes) =>
      processes.runCaptured("bun", ["-e", 'console.log("hello")']),
    );
    expect(Either.isRight(output)).toBe(true);
    if (Either.isRight(output)) {
      expect(output.right).toBe("hello\n");
    }
  });

  test("keeps the stderr tail on CommandFailedError", async () => {
    const result = await withService((processes) =>
      processes.runCaptured("bun", [
        "-e",
        'console.error("boom"); process.exit(1)',
      ]),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(CommandFailedError);
      expect(result.left.output ?? "").toContain("boom");
    }
  });
});
```

Run: `bun test src/process/process.service.test.ts` → Expected: FAIL (typecheck: `runCaptured` does not exist on `ProcessApi`).

- [ ] **Step 2: Add the `output` field to CommandFailedError**

In `src/process/process.types.ts`:

```ts
class CommandFailedError extends Data.TaggedError("CommandFailedError")<{
  readonly command: string;
  readonly exitCode: number;
  readonly output?: string;
}> {
  override get message(): string {
    const base: string = ChildProcess.messages.commandFailed(
      this.command,
      this.exitCode,
    );
    return this.output === undefined ? base : `${base}\n${this.output}`;
  }
}
```

- [ ] **Step 3: Add `stderrTailLength` to process.constants.ts**

In the `ChildProcess` constant object, add:

```ts
  /** Longest stderr snippet kept on a failed command. */
  stderrTailLength: 4096,
```

- [ ] **Step 4: Implement `runCaptured` in process.service.ts**

Add the decoder helper above the class:

```ts
const decodeOutput = (chunks: Chunk.Chunk<Uint8Array>): string => {
  const parts: readonly Uint8Array[] = Array.from(chunks);
  const total: number = parts.reduce(
    (sum: number, part: Uint8Array): number => sum + part.byteLength,
    0,
  );
  const merged: Uint8Array = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(merged);
};
```

Inside the service `effect` (next to `run`):

```ts
      const runCaptured = (
        executable: string,
        args: readonly string[],
      ): Effect.Effect<string, CommandFailedError | PlatformError> =>
        Effect.scoped(
          Effect.gen(function* () {
            const child: CommandExecutor.Process = yield* executor.start(
              buildCommand(executable, args, true),
            );
            const result: {
              exitCode: number;
              stderr: string;
              stdout: string;
            } = yield* Effect.all({
              exitCode: child.exitCode,
              stderr: Stream.runCollect(child.stderr).pipe(
                Effect.map(decodeOutput),
              ),
              stdout: Stream.runCollect(child.stdout).pipe(
                Effect.map(decodeOutput),
              ),
            });
            if (result.exitCode === ChildProcess.successExitCode) {
              return result.stdout;
            }
            return yield* new CommandFailedError({
              command: [executable, ...args].join(" "),
              exitCode: result.exitCode,
              output: result.stderr.slice(-ChildProcess.stderrTailLength),
            });
          }),
        );
```

Update `api`: `const api: ProcessApi = { run, runCaptured, succeeds };`

Add to `src/process/process.interface.ts`:

```ts
  /** Runs a piped command, returning stdout and capturing stderr on failure. */
  readonly runCaptured: (
    executable: string,
    args: readonly string[],
  ) => Effect.Effect<string, CommandFailedError | PlatformError>;
```

Update imports in `process.service.ts`: add `Chunk` and `Stream` to the `effect` import (`import { Chunk, Effect, Stream } from "effect";`).

- [ ] **Step 5: Run the tests**

Run: `bun test src/process/process.service.test.ts` → Expected: PASS (2 tests).
Run: `bun run typecheck` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/process
git commit -m "feat: capture stderr tail in CommandFailedError via runCaptured"
```

---

### Task 11: DockerService.composeCaptured

**Files:**
- Modify: `src/docker/docker.interface.ts`
- Modify: `src/docker/docker.service.ts`
- Create: `src/docker/docker.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/docker/docker.service.test.ts`:

```ts
import { DockerService } from "@app/docker/docker.service.ts";
import { composeArgs } from "@app/docker/docker.utils.ts";
import { ProcessService } from "@app/process/process.service.ts";
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { DockerApi } from "@app/docker/docker.interface.ts";
import type { ProcessApi } from "@app/process/process.interface.ts";

const fakeProcesses = (
  output: string,
): { api: ProcessApi; calls: Array<readonly string[]> } => {
  const calls: Array<readonly string[]> = [];
  const api: ProcessApi = {
    run: (): Effect.Effect<void> => Effect.succeed(undefined),
    runCaptured: (
      _executable: string,
      args: readonly string[],
    ): Effect.Effect<string> => {
      calls.push(args);
      return Effect.succeed(output);
    },
    succeeds: (): Effect.Effect<boolean> => Effect.succeed(true),
  };
  return { api, calls };
};

describe("composeCaptured", () => {
  test("prefixes the compose arguments and returns the output", async () => {
    const fake = fakeProcesses('{"ok":true}');
    const output = await Effect.runPromise(
      Effect.gen(function* () {
        const docker: DockerApi = yield* DockerService;
        return yield* docker.composeCaptured(
          "cpu",
          ["ps", "--format", "json"],
          { local: true },
        );
      }).pipe(Effect.provide(Layer.succeed(ProcessService, fake.api))),
    );
    expect(output).toBe('{"ok":true}');
    expect(fake.calls[0]).toEqual([
      ...composeArgs("cpu", { local: true }),
      "ps",
      "--format",
      "json",
    ]);
  });
});
```

Run: `bun test src/docker/docker.service.test.ts` → Expected: FAIL (`composeCaptured` missing).

- [ ] **Step 2: Implement composeCaptured**

In `src/docker/docker.service.ts`, next to `compose`:

```ts
    const composeCaptured = (
      backend: Backend,
      args: readonly string[],
      options?: ComposeOptions,
    ): Effect.Effect<string, CommandFailedError | PlatformError> =>
      processes.runCaptured(Docker.cli, [
        ...composeArgs(backend, options ?? {}),
        ...args,
      ]);
```

Update `api`: `const api: DockerApi = { assertAvailable, compose, composeCaptured };`

In `src/docker/docker.interface.ts`, add to `DockerApi`:

```ts
  /** Runs a compose command and returns its stdout, capturing errors. */
  readonly composeCaptured: (
    backend: Backend,
    args: readonly string[],
    options?: ComposeOptions,
  ) => Effect.Effect<string, CommandFailedError | PlatformError>;
```

- [ ] **Step 3: Run the tests**

Run: `bun test src/docker/docker.service.test.ts` → Expected: PASS.
Run: `bun run typecheck` → Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/docker
git commit -m "feat: add docker composeCaptured for diagnosable output"
```

---

### Task 12: Replace `Effect.orDie` with typed domain errors

**Files:**
- Modify: `src/env/env.service.ts` (or `env.utils.ts` if `readFile` lives there)
- Modify: `src/env/env.types.ts`
- Modify: `src/env/env.constants.ts`
- Modify: `src/stack/stack.helpers.ts`
- Modify: `src/secret/secret.types.ts`
- Modify: `src/stack/stack.interface.ts`

- [ ] **Step 1: Add `EnvReadError`**

In `src/env/env.types.ts`:

```ts
class EnvReadError extends Data.TaggedError("EnvReadError")<{
  readonly file: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `Could not read ${this.file}: ${this.reason}`;
  }
}
```

(add the `Data` import from `effect`.)

In `src/env/env.constants.ts`, add to `EnvFile.messages`:

```ts
    readFailed: (file: string, reason: string): string =>
      `Could not read ${file}: ${reason}`,
```

and use it in the `message` getter: `return EnvFile.messages.readFailed(this.file, this.reason);`

- [ ] **Step 2: Replace the orDie in env reading**

In `readFile` (wherever it lives), replace the `Effect.orDie(config)` usage:

```ts
const readFile = <A>(
  path: string,
  config: Config.Config<A>,
): Effect.Effect<A, EnvReadError | PlatformError> =>
  provider(path).pipe(
    Effect.flatMap(
      (source: ConfigProvider.ConfigProvider): Effect.Effect<A, EnvReadError> =>
        Effect.withConfigProvider(config, source).pipe(
          Effect.mapError(
            (cause: unknown): EnvReadError =>
              new EnvReadError({ file: path, reason: String(cause) }),
          ),
        ),
    ),
  );
```

Update `EnvApi` (`env.interface.ts`) error types: `read`, `readClient`, `requireModel` now fail with `EnvReadError | PlatformError`.

- [ ] **Step 3: Add `TunnelTokenReadError`**

In `src/secret/secret.types.ts`:

```ts
class TunnelTokenReadError extends Data.TaggedError("TunnelTokenReadError")<{
  readonly reason: string;
  readonly variable: string;
}> {
  override get message(): string {
    return `Could not read ${this.variable}: ${this.reason}`;
  }
}
```

- [ ] **Step 4: Replace the orDie in readTunnelToken**

In `src/stack/stack.helpers.ts`, `readTunnelToken` currently does `yield* Effect.orDie(tunnelTokenConfig)`. Replace with:

```ts
    const fromEnvironment: Option.Option<Redacted.Redacted<string>> =
      yield* tunnelTokenConfig.pipe(
        Effect.mapError(
          (cause: unknown): TunnelTokenReadError =>
            new TunnelTokenReadError({
              reason: String(cause),
              variable: Secrets.tunnelTokenVariable,
            }),
        ),
      );
```

and extend `readTunnelToken`'s error type to `EmptyTunnelTokenError | TunnelTokenReadError`.

- [ ] **Step 5: Update the error unions**

In `src/stack/stack.interface.ts`:
- `InitError` += `TunnelTokenReadError`
- `BackendResolutionError` += `EnvReadError`
- `PreflightError` += `EnvReadError`
- `SmokeTestError` += `EnvReadError`

- [ ] **Step 6: Verify and commit**

Run: `bun test` → Expected: PASS (no regressions).
Run: `bun run typecheck` → Expected: no errors — this is what proves the `orDie` removal: the error types are now total and domain-typed.

```bash
git add src/env src/secret src/stack
git commit -m "fix: replace orDie with typed env and tunnel token errors"
```

---

### Task 13: Atomic model downloads (`.part` + rename + cleanup)

**Files:**
- Modify: `src/model/model.helpers.ts`

- [ ] **Step 1: Rewrite `resolveDownloadUrl`**

Replace the function with:

```ts
const resolveDownloadUrl = (
  dependencies: ModelDependencies,
  source: ModelSource.DownloadUrl,
  directory: string,
): Effect.Effect<ResolvedModel, ModelDownloadError> =>
  Effect.gen(function* () {
    const file: string = yield* Option.match(
      fileNameFromUrl(source.url),
      {
        onNone: (): ModelDownloadError =>
          new ModelDownloadError({
            reason: Model.messages.unnamedUrl,
            url: source.url,
          }),
        onSome: (name: string): string => name,
      },
    );
    const target: string = dependencies.path.join(directory, file);
    const partial: string = `${target}.part`;
    yield* dependencies.fileSystem.makeDirectory(directory, {
      recursive: true,
    });
    yield* dependencies.fileSystem
      .remove(partial)
      .pipe(Effect.asVoid(), Effect.catchAll((): Effect.Effect<void> => Effect.void));
    yield* Console.log(Model.messages.downloadingUrl(source.url, target));
    const cleanup: Effect.Effect<void, never> = dependencies.fileSystem
      .remove(partial)
      .pipe(
        Effect.asVoid(),
        Effect.catchAll((): Effect.Effect<void> => Effect.void),
      );
    yield* Effect.ensuring(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          catch: (cause: unknown): ModelDownloadError =>
            new ModelDownloadError({ reason: String(cause), url: source.url }),
          try: async (): Promise<void> => {
            const response: Response = await fetch(source.url);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            await Bun.write(partial, response);
          },
        });
        yield* dependencies.fileSystem.move(partial, target).pipe(Effect.asVoid());
      }),
      cleanup,
    );
    return { directory: toPosixPath(directory), file };
  });
```

Notes:
- Match the existing function signature/parameter order exactly; adjust the call inside `resolveModel`.
- The stale-partial cleanup runs before the download; `cleanup` runs after (removes the partial on failure, is a no-op after a successful `move`).
- `Effect.ensuring` requires a total finalizer — `catchAll` makes it so.

- [ ] **Step 2: Verify**

Run: `bun test src/model/model.helpers.test.ts` → Expected: PASS (the Task 5 assertions on `exists`/`partial` cover the postconditions: file present, no `.part` leftover, no file on failure).
Run: `bun run typecheck` → Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/model/model.helpers.ts
git commit -m "fix: download models atomically via .part temp file"
```

---

### Task 14: rotate-key waits for llama health (`waitLlamaHealthy`)

**Files:**
- Modify: `src/docker/docker.constants.ts`
- Modify: `src/stack/stack.constants.ts`
- Modify: `src/stack/stack.types.ts`
- Modify: `src/stack/stack.utils.ts`
- Create: `src/stack/rotate.ts`
- Modify: `src/stack/stack.helpers.ts` (remove `rotateApiKey`)
- Modify: `src/stack/stack.interface.ts`
- Modify: `src/stack/stack.service.ts`
- Create: `src/stack/rotate.test.ts`

- [ ] **Step 1: Add constants and the status parser**

In `src/docker/docker.constants.ts`, add to `verbs`:

```ts
    psJson: ["ps", "--format", "json"],
```

In `src/stack/stack.utils.ts`, add:

```ts
interface ComposeStatusEntry {
  readonly health: string;
  readonly service: string;
  readonly state: string;
}

/** Parses the output of `docker compose ps --format json` into entries. */
const parseComposeStatus = (json: string): readonly ComposeStatusEntry[] => {
  try {
    const services: unknown = JSON.parse(json);
    if (!Array.isArray(services)) {
      return [];
    }
    return services.flatMap((entry: unknown): ComposeStatusEntry[] => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.Service !== "string") {
        return [];
      }
      return [
        {
          health: typeof record.Health === "string" ? record.Health : "",
          service: record.Service,
          state: typeof record.State === "string" ? record.State : "",
        },
      ];
    });
  } catch {
    return [];
  }
};
```

and export it: add `parseComposeStatus` (and `type ComposeStatusEntry`) to the export list.

- [ ] **Step 2: Add `LlamaNotHealthyError`**

In `src/stack/stack.types.ts`:

```ts
class LlamaNotHealthyError extends Data.TaggedError("LlamaNotHealthyError")<{
  readonly backend: Backend;
}> {
  override get message(): string {
    return Stack.messages.llamaNotHealthy(this.backend);
  }
}
```

In `src/stack/stack.constants.ts`, add to `messages`:

```ts
    llamaNotHealthy: (backend: string): string =>
      `llama.cpp is not healthy after restart (backend=${backend}); ` +
      "run `stack status` to inspect the stack.",
```

- [ ] **Step 3: Write the failing test**

Create `src/stack/rotate.test.ts`:

```ts
import { waitLlamaHealthy } from "@app/stack/rotate.ts";
import { describe, expect, test } from "bun:test";
import { Effect, Either } from "effect";
import { LlamaNotHealthyError } from "@app/stack/stack.types.ts";
import type { DockerApi } from "@app/docker/docker.interface.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";

const fakeDocker = (json: string): DockerApi => ({
  assertAvailable: (): Effect.Effect<void> => Effect.succeed(undefined),
  compose: (): Effect.Effect<void> => Effect.succeed(undefined),
  composeCaptured: (): Effect.Effect<string> => Effect.succeed(json),
});

const dependencies = (json: string): StackDependencies =>
  ({ docker: fakeDocker(json) }) as unknown as StackDependencies;

describe("waitLlamaHealthy", () => {
  test("succeeds while the llama service is healthy", async () => {
    const result = await Effect.runPromise(
      waitLlamaHealthy(
        dependencies(
          JSON.stringify([{ Health: "healthy", Service: "llama" }]),
        ),
        "cpu",
        true,
        3,
        10,
      ).pipe(Effect.either),
    );
    expect(Either.isRight(result)).toBe(true);
  });

  test("fails with LlamaNotHealthyError when the service never heals", async () => {
    const result = await Effect.runPromise(
      waitLlamaHealthy(
        dependencies(
          JSON.stringify([{ Health: "starting", Service: "llama" }]),
        ),
        "cpu",
        true,
        3,
        10,
      ).pipe(Effect.either),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(LlamaNotHealthyError);
    }
  });

  test("treats malformed compose output as not yet healthy", async () => {
    const result = await Effect.runPromise(
      waitLlamaHealthy(
        dependencies("not-json"),
        "cpu",
        true,
        2,
        10,
      ).pipe(Effect.either),
    );
    expect(Either.isLeft(result)).toBe(true);
  });
});
```

Run: `bun test src/stack/rotate.test.ts` → Expected: FAIL (`@app/stack/rotate.ts` missing).

- [ ] **Step 4: Create `src/stack/rotate.ts`**

```ts
import { Docker } from "@app/docker/docker.constants.ts";
import type { Backend } from "@app/backend/backend.types.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import { LlamaNotHealthyError } from "@app/stack/stack.types.ts";
import {
  parseComposeStatus,
  type ComposeStatusEntry,
} from "@app/stack/stack.utils.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import { Console, Effect, Redacted } from "effect";

const LlamaPoll = {
  attempts: 60,
  delayMs: 5_000,
} as const;

const isLlamaHealthy = (
  dependencies: StackDependencies,
  backend: Backend,
  local: boolean,
): Effect.Effect<boolean, CommandFailedError | PlatformError> =>
  Effect.gen(function* () {
    const output: string = yield* dependencies.docker.composeCaptured(
      backend,
      Docker.verbs.psJson,
      { local },
    );
    const services: readonly ComposeStatusEntry[] = yield* Effect.try({
      catch: (): readonly ComposeStatusEntry[] => [],
      try: (): readonly ComposeStatusEntry[] => parseComposeStatus(output),
    });
    const llama: ComposeStatusEntry | undefined = services.find(
      (service: ComposeStatusEntry): boolean =>
        service.service === Docker.services.llama,
    );
    return llama !== undefined && llama.health === "healthy";
  });

const waitLlamaHealthy = (
  dependencies: StackDependencies,
  backend: Backend,
  local: boolean,
  attempts: number = LlamaPoll.attempts,
  delayMs: number = LlamaPoll.delayMs,
): Effect.Effect<void, CommandFailedError | LlamaNotHealthyError | PlatformError> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (yield* isLlamaHealthy(dependencies, backend, local)) {
        return;
      }
      if (attempt < attempts - 1) {
        yield* Effect.sleep(delayMs);
      }
    }
    return yield* new LlamaNotHealthyError({ backend });
  });

const rotateApiKey = (
  dependencies: StackDependencies,
  backend: Backend,
  local: boolean,
): Effect.Effect<void, CommandFailedError | LlamaNotHealthyError | PlatformError> =>
  Effect.gen(function* () {
    const key: Redacted.Redacted<string> =
      yield* dependencies.secrets.rotateApiKey();
    yield* Console.log(Stack.messages.rotated);
    yield* Console.log(
      Stack.messages.rotatedFingerprint(
        dependencies.secrets.fingerprint(key),
      ),
    );
    yield* Console.log(Stack.messages.restartingLlama);
    yield* dependencies.docker.compose(
      backend,
      Docker.verbs.restartLlama,
      { local },
    );
    yield* waitLlamaHealthy(dependencies, backend, local);
    yield* Console.log(Stack.messages.rotatedClients);
  });

export { rotateApiKey, waitLlamaHealthy };
```

(Move `rotateApiKey` from `stack.helpers.ts`; the only change is the added `waitLlamaHealthy` call before the `rotatedClients` message.)

- [ ] **Step 5: Rewire the service and the factory**

- `src/stack/stack.helpers.ts`: delete `rotateApiKey` and drop imports that become unused.
- `src/stack/stack.service.ts`: import `rotateApiKey` from `@app/stack/rotate.ts`.
- `src/stack/stack.interface.ts`: `rotateKey` now returns `Effect<void, CommandFailedError | LlamaNotHealthyError | PlatformError>`.
- `src/stack/stack.factory.ts` / commands: update `StackCommandError` to include `LlamaNotHealthyError` (it is part of the rotate-key subcommand's error union).

- [ ] **Step 6: Verify**

Run: `bun test src/stack/rotate.test.ts` → Expected: PASS (3 tests).
Run: `bun run typecheck` → Expected: no errors.

```bash
git add src/docker src/stack
git commit -m "feat: wait for llama health after rotate-key restart"
```

---

### Task 15: `init` overwrite protection (`--force` + confirmation)

**Files:**
- Modify: `src/stack/stack.types.ts`
- Modify: `src/stack/stack.constants.ts`
- Modify: `src/stack/stack.helpers.ts`
- Modify: `src/stack/stack.factory.ts`
- Modify: `src/stack/stack.interface.ts`
- Modify: `src/stack/stack.utils.test.ts` (or a new test file)

- [ ] **Step 1: Add types**

In `src/stack/stack.types.ts`:

```ts
class InitAbortedError extends Data.TaggedError("InitAbortedError")<{
  readonly paths: readonly string[];
}> {
  override get message(): string {
    return Stack.messages.aborted(this.paths);
  }
}
```

Add `readonly force: boolean;` to `InitInput`.

In `src/stack/stack.constants.ts`, add to `messages`:

```ts
    aborted: (paths: readonly string[]): string =>
      `Aborted: kept existing files (${paths.join(", ")}); ` +
      "re-run init with --force to overwrite.",
```

and to `descriptions`:

```ts
    force: "Overwrite an existing .env and secrets without asking",
```

- [ ] **Step 2: Implement the guard in stack.helpers.ts**

Add (exported):

```ts
const overwritePaths = (
  dependencies: StackDependencies,
  local: boolean,
): Effect.Effect<readonly string[], PlatformError> =>
  Effect.gen(function* () {
    const apiKey: string = yield* dependencies.path.join(
      Secrets.directory,
      Secrets.files.apiKey,
    );
    const tunnelToken: string = yield* dependencies.path.join(
      Secrets.directory,
      Secrets.files.tunnelToken,
    );
    return [
      apiKey,
      ...(local === true ? [] : [tunnelToken]),
      EnvFile.path,
    ];
  });
```

At the top of `initialize` (before the model resolution — so we never download a model and then abort):

```ts
    const paths: readonly string[] =
      yield* overwritePaths(dependencies, input.local);
    const present: readonly boolean[] = yield* Effect.all(
      paths.map(
        (path: string): Effect.Effect<boolean> =>
          dependencies.fileSystem.exists(path),
      ),
    );
    const existing: readonly string[] = paths.filter(
      (path: string, index: number): boolean =>
        present[index] === true,
    );
    if (existing.length > 0 && input.force !== true) {
      const overwrite: boolean = yield* Prompt.run(
        Prompt.confirm({
          default: false,
          message: `Already initialized (${existing.join(", ")}). Overwrite?`,
        }),
      );
      if (overwrite !== true) {
        return yield* new InitAbortedError({ paths: existing });
      }
    }
```

Extend `initialize`'s error type to `InitError | InitAbortedError`-equivalent (i.e. add `InitAbortedError`).

- [ ] **Step 3: Wire the `--force` flag**

In `src/stack/stack.factory.ts`, add to `initOptions`:

```ts
    force: Options.boolean("force").pipe(
      Options.withDescription(Stack.descriptions.force),
    ),
```

(The resolved options object gains `force: boolean`, which flows into `InitInput`.)

- [ ] **Step 4: Update unions**

`src/stack/stack.interface.ts`: `InitError` += `InitAbortedError`.

- [ ] **Step 5: Test the path computation**

Add to `src/stack/stack.utils.test.ts` (or a dedicated test):

```ts
import { overwritePaths } from "@app/stack/stack.helpers.ts";
import { Secrets } from "@app/secret/secret.constants.ts";
import { EnvFile } from "@app/env/env.constants.ts";
import { BunContext } from "@effect/platform-bun";
import { Path } from "@effect/platform";
import { Effect } from "effect";
import type { StackDependencies } from "@app/stack/stack.interface.ts";

test("initOverwritePaths lists the files init would replace", async () => {
  const paths = await Effect.runPromise(
    Effect.gen(function* () {
      const dependencies: StackDependencies = {
        path: yield* Path.Path,
      } as unknown as StackDependencies;
      return yield* overwritePaths(dependencies, false);
    }).pipe(Effect.provide(BunContext.layer)),
  );
  expect(paths).toEqual([
    `${Secrets.directory}/${Secrets.files.apiKey}`,
    `${Secrets.directory}/${Secrets.files.tunnelToken}`,
    EnvFile.path,
  ]);
});

test("initOverwritePaths omits the tunnel token in local mode", async () => {
  const paths = await Effect.runPromise(
    Effect.gen(function* () {
      const dependencies: StackDependencies = {
        path: yield* Path.Path,
      } as unknown as StackDependencies;
      return yield* overwritePaths(dependencies, true);
    }).pipe(Effect.provide(BunContext.layer)),
  );
  expect(paths).toEqual([
    `${Secrets.directory}/${Secrets.files.apiKey}`,
    EnvFile.path,
  ]);
});
```

- [ ] **Step 6: Verify**

Run: `bun test` → Expected: PASS.
Run: `bun run typecheck` → Expected: no errors.

Manual check (optional, needs a live stack repo): `bun run stack init --local` on an already-initialized machine prompts; answering no aborts with the `Aborted:` message and leaves files untouched; `--force` skips the prompt.

```bash
git add src/stack
git commit -m "feat: confirm before init overwrites existing secrets"
```

---

### Task 16: `test` timeout + distinct HTTP errors

**Files:**
- Modify: `src/stack/stack.constants.ts`
- Modify: `src/stack/stack.types.ts`
- Modify: `src/stack/stack.interface.ts`
- Modify: `src/stack/stack.utils.ts`
- Modify: `src/stack/stack.helpers.ts`
- Create: `src/stack/stack.helpers.test.ts`

Verified API notes (this @effect/platform version):
- There is **no** `HttpClientRequest.timeout` combinator. Use `Effect.timeout(ms)` on `httpClient.execute`; on timeout the error is `Cause.TimeoutException` (import `Cause` from `effect`).

- [ ] **Step 1: Add constants and errors**

`src/stack/stack.constants.ts` → `smoke`: add `timeoutMs: 30_000`.

`src/stack/stack.types.ts`:

```ts
class LlamaAuthError extends Data.TaggedError("LlamaAuthError")<{
  readonly endpoint: string;
}> {
  override get message(): string {
    return Stack.messages.llamaAuth(this.endpoint);
  }
}

class LlamaUnreachableError extends Data.TaggedError("LlamaUnreachableError")<{
  readonly endpoint: string;
  readonly reason: string;
}> {
  override get message(): string {
    return Stack.messages.llamaUnreachable(this.endpoint, this.reason);
  }
}
```

`src/stack/stack.constants.ts` → `messages`:

```ts
    llamaAuth: (endpoint: string): string =>
      `${endpoint} rejected the API key (401/403). Check LLAMA_API_KEY ` +
      "and the Cloudflare Access token in clients/client.env.",
    llamaUnreachable: (endpoint: string, reason: string): string =>
      `${endpoint} did not answer (${reason}). Start the stack ` +
      "(bun run stack up) or check LLAMA_BASE_URL in clients/client.env.",
```

`src/stack/stack.interface.ts` → `SmokeTestError`: replace the raw `HttpClientError` member with `LlamaAuthError | LlamaUnreachableError`.

- [ ] **Step 2: Parameterize the completion request**

In `src/stack/stack.utils.ts`:

```ts
const makeCompletionRequest = (
  model: string,
  maxTokens: number = Stack.smoke.maxTokens,
): CompletionRequest => ({
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
  max_tokens: maxTokens,
  messages: [{ content: Stack.smoke.prompt, role: Stack.smoke.role }],
  model,
});
```

and `makeSmokeTarget` gains an optional third argument:

```ts
const makeSmokeTarget = (
  client: ClientEnv,
  alias: string,
  options?: { maxTokens?: number },
): Effect.Effect<SmokeTarget, MissingClientConfigError> =>
  // ... existing body, but:
  //   HttpClientRequest.bodyUnsafeJson(
  //     makeCompletionRequest(alias, options?.maxTokens ?? Stack.smoke.maxTokens),
  //   ),
```

(Keep the rest of the function — endpoint, headers, bearer token — unchanged.)

- [ ] **Step 3: Rewrite `smokeTest` in stack.helpers.ts**

```ts
const smokeTest = (
  dependencies: StackDependencies,
): Effect.Effect<void, SmokeTestError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient();
    const values: StackEnv = yield* dependencies.env.read();
    const alias: string =
      values.modelAlias.getOrElse(Stack.smoke.fallbackAlias);
    const target: SmokeTarget = yield* makeSmokeTarget(client, alias);
    const response: HttpClientResponse.HttpClientResponse =
      yield* dependencies.httpClient.execute(target.request).pipe(
        Effect.timeout(Stack.smoke.timeoutMs),
        Effect.mapError(
          (cause): LlamaUnreachableError =>
            new LlamaUnreachableError({
              endpoint: target.endpoint,
              reason:
                cause instanceof Cause.TimeoutException
                  ? `did not answer within ${Stack.smoke.timeoutMs}ms`
                  : String(cause.cause ?? "network error"),
            }),
        ),
      );
    if (response.status === 401 || response.status === 403) {
      return yield* new LlamaAuthError({ endpoint: target.endpoint });
    }
    if (response.status >= Stack.smoke.errorStatus) {
      const body: string = (yield* response.text).slice(
        0,
        Stack.smoke.snippetLength,
      );
      return yield* new LlamaRequestError({ body, status: response.status });
    }
    const completion: {
      choices: readonly { message: { content: string } }[];
    } = yield* HttpClientResponse.schemaBodyJson(
      response,
      completionResponseSchema,
    ).pipe(
      Effect.mapError(
        (cause: unknown): LlamaResponseError =>
          new LlamaResponseError({
            endpoint: target.endpoint,
            reason: String(cause).slice(0, Stack.smoke.snippetLength),
          }),
      ),
    );
    yield* Console.log(completion.choices[0].message.content);
  });
```

Notes: keep the existing `schemaBodyJson` call shape if the current code differs slightly (the error mapping is the new part). Imports: add `Cause`, `HttpClientResponse` from `effect`/`@effect/platform`.

- [ ] **Step 4: Write the tests**

Create `src/stack/stack.helpers.test.ts`:

```ts
import { smokeTest } from "@app/stack/stack.helpers.ts";
import { describe, expect, test } from "bun:test";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Effect, Either, Option } from "effect";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import type { EnvApi } from "@app/env/env.interface.ts";
import type { ClientEnv, StackEnv } from "@app/env/env.types.ts";
import { LlamaAuthError } from "@app/stack/stack.types.ts";
import { LlamaUnreachableError } from "@app/stack/stack.types.ts";

const fakeEnv = (
  baseUrl: string,
  apiKey: string,
): EnvApi => ({
  read: (): Effect.Effect<StackEnv> =>
    Effect.succeed({
      backend: Option.none(),
      localPort: Option.none(),
      modelAlias: Option.some("phi"),
      modelDirectory: Option.none(),
      modelFile: Option.none(),
    }),
  readClient: (): Effect.Effect<ClientEnv> =>
    Effect.succeed({
      accessClientId: Option.none(),
      accessClientSecret: Option.none(),
      apiKey: Option.some(apiKey),
      baseUrl: Option.some(baseUrl),
    }),
  requireModel: (): Effect.Effect<unknown> => Effect.succeed({}),
  write: (): Effect.Effect<void> => Effect.succeed(undefined),
});

const runSmoke = (
  baseUrl: string,
  fetch: (request: Request) => Response,
): Promise<Either.Either<void, unknown>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const httpClient: HttpClient.HttpClient = yield* HttpClient.HttpClient;
      const deps: StackDependencies = {
        env: fakeEnv(baseUrl, "llama_test"),
        httpClient,
      } as unknown as StackDependencies;
      return yield* smokeTest(deps).pipe(Effect.either);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );

describe("smokeTest", () => {
  test("reports LlamaAuthError on a 401 answer", async () => {
    const server = Bun.serve({
      fetch: (): Response => new Response("unauthorized", { status: 401 }),
      port: 49917,
    });
    const result = await runSmoke(
      `http://127.0.0.1:${server.port}`,
      server.fetch,
    );
    server.stop();
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(LlamaAuthError);
    }
  });

  test("reports LlamaUnreachableError when nothing listens", async () => {
    const result = await runSmoke(
      "http://127.0.0.1:49919",
      (request: Request): Response => new Response("unused"),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(LlamaUnreachableError);
    }
  });

  test("prints the completion on success", async () => {
    const server = Bun.serve({
      fetch: (request: Request): Response => {
        if (request.headers.get("authorization") !== "Bearer llama_test") {
          return new Response("unauthorized", { status: 401 });
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      },
      port: 49917,
    });
    const result = await runSmoke(
      `http://127.0.0.1:${server.port}`,
      server.fetch,
    );
    server.stop();
    expect(Either.isRight(result)).toBe(true);
  });
});
```

Note: `server.fetch` is not part of the public Bun Server API — replace `runSmoke`'s second argument usage with the `fetch` function captured in the closure (pass the handler, not `server.fetch`). The handler is only needed implicitly; simplify by inlining the handler in each test and dropping the parameter.

Run: `bun test src/stack/stack.helpers.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 5: Verify and commit**

Run: `bun run typecheck` → Expected: no errors.

```bash
git add src/stack
git commit -m "fix: give the smoke test a timeout and distinct error kinds"
```

---

## Tier 2 — New operations

### Task 17: Shared command builders (`commands.ts`) + `status` + `logs --service`

**Files:**
- Modify: `src/stack/stack.constants.ts` (remove `status` and `logs` from `lifecycle`)
- Create: `src/stack/commands.ts`
- Modify: `src/stack/stack.factory.ts`
- Modify: `src/docker/docker.constants.ts` (add `verbs.down` — used by Task 21, added now)

- [ ] **Step 1: Trim the lifecycle list**

In `src/stack/stack.constants.ts`, delete the `status` (`ps`) and `logs` entries from `lifecycle`.

- [ ] **Step 2: Create `src/stack/commands.ts`**

Move `localOption`, `backendOption`, `withBackend`, `makeLifecycleCommand` from `stack.factory.ts` verbatim, and add `jsonOption`, `statusCommand`, `logsCommand`:

```ts
const jsonOption = Options.boolean("json").pipe(
  Options.withDescription("Print machine-readable JSON"),
);

const statusCommand = Command.make(
  "status",
  {
    backend: backendOption,
    json: jsonOption,
    local: localOption,
  },
  (config) =>
    withBackend(config.backend, (backend: Backend) =>
      Effect.gen(function* () {
        const docker: DockerService = yield* DockerService;
        yield* docker.assertAvailable();
        const output: string = yield* docker.composeCaptured(
          backend,
          Docker.verbs.psJson,
          { local: config.local },
        );
        if (config.json) {
          yield* Console.log(output);
          return;
        }
        const services: readonly ComposeStatusEntry[] =
          parseComposeStatus(output);
        if (services.length === 0) {
          yield* Console.log("No running services.");
          return;
        }
        for (const service of services) {
          yield* Console.log(
            `${service.service}\t${service.state}\t${service.health}`,
          );
        }
      }),
    ),
);

const serviceOption = Options.choice("service", [
  Docker.services.llama,
  "cloudflared",
  "proxy",
]).pipe(
  Options.withDefault(Docker.services.llama),
  Options.withDescription("Service to follow"),
);

const logsCommand = Command.make(
  "logs",
  {
    backend: backendOption,
    local: localOption,
    service: serviceOption,
  },
  (config) =>
    withBackend(config.backend, (backend: Backend) =>
      Effect.gen(function* () {
        const docker: DockerService = yield* DockerService;
        yield* docker.assertAvailable();
        yield* docker.compose(
          backend,
          ["logs", "-f", config.service],
          { local: config.local },
        );
      }),
    ),
);
```

Export everything the factory needs: `localOption`, `backendOption`, `jsonOption`, `withBackend`, `makeLifecycleCommand`, `statusCommand`, `logsCommand`.

In `src/docker/docker.constants.ts` add to `verbs`: `down: ["down"],`.

- [ ] **Step 3: Update the factory**

In `src/stack/stack.factory.ts`: import the moved helpers from `@app/stack/commands.ts`; delete the local copies; add `logsCommand, statusCommand` to the `withSubcommands` list.

- [ ] **Step 4: Verify**

Run: `bun run typecheck` → Expected: no errors.
Run: `bun test` → Expected: PASS.

Manual check: `bun run stack status` prints a `SERVICE  STATE  HEALTH` table; `bun run stack logs --service cloudflared` follows cloudflared.

```bash
git add src/stack src/docker
git commit -m "feat: add status with health and logs --service"
```

---

### Task 18: `stack doctor`

**Files:**
- Create: `src/stack/doctor.ts`
- Modify: `src/stack/stack.types.ts`
- Modify: `src/stack/stack.interface.ts`
- Modify: `src/stack/stack.service.ts`
- Modify: `src/stack/commands.ts`
- Modify: `src/stack/stack.constants.ts`
- Create: `src/stack/doctor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stack/doctor.test.ts`:

```ts
import { doctor } from "@app/stack/doctor.ts";
import { describe, expect, test } from "bun:test";
import { Effect, Either, Redacted } from "effect";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import type { DockerApi } from "@app/docker/docker.interface.ts";
import {
  DockerUnavailableError,
} from "@app/docker/docker.types.ts";
import { IncompatibleHostError } from "@app/backend/backend.types.ts";
import { MissingSecretError } from "@app/secret/secret.types.ts";
import { EnvNotInitializedError } from "@app/env/env.types.ts";
import { CommandFailedError } from "@app/process/process.types.ts";

const failingDocker: DockerApi = {
  assertAvailable: (): Effect.Effect<void, DockerUnavailableError> =>
    Effect.fail(new DockerUnavailableError({ reason: "no daemon" })),
  compose: (): Effect.Effect<void> =>
    Effect.fail(
      new CommandFailedError({ command: "docker compose", exitCode: 1 }),
    ),
  composeCaptured: (): Effect.Effect<string> =>
    Effect.fail(
      new CommandFailedError({ command: "docker compose", exitCode: 1 }),
    ),
};

const failingDependencies: StackDependencies = {
  backends: {
    assertDevices: (): Effect.Effect<void> =>
      Effect.fail(new IncompatibleHostError({ reason: "amd" })),
    assertHost: (): Effect.Effect<void> =>
      Effect.fail(new IncompatibleHostError({ reason: "amd" })),
    parse: (value: string): Effect.Effect<string, never> =>
      Effect.succeed(value),
  },
  docker: failingDocker,
  env: {
    read: (): Effect.Effect<unknown> => Effect.succeed({}),
    readClient: (): Effect.Effect<unknown> =>
      Effect.fail(
        new (class extends Effect {})()) as never,
      // replaced in the real file; see notes
    requireModel: (): Effect.Effect<unknown, EnvNotInitializedError> =>
      Effect.fail(
        new EnvNotInitializedError({ missing: "MODEL_DIRECTORY, MODEL_FILE" }),
      ),
    write: (): Effect.Effect<void> => Effect.succeed(undefined),
  },
  fileSystem: {} as unknown as import("@effect/platform").FileSystem,
  host: {
    homeDirectory: Effect.succeed("/h"),
    isPlatform: (): boolean => false,
    platform: "linux",
    threads: { batch: 1, generation: 1 },
  },
  httpClient: (() => Effect.void) as unknown as import("@effect/platform").HttpClient,
  models: {
    resolve: (): Effect.Effect<unknown> => Effect.succeed({}),
  },
  path: {} as unknown as import("@effect/platform").Path,
  secrets: {
    assertPresent: (): Effect.Effect<void, MissingSecretError> =>
      Effect.fail(new MissingSecretError({ name: ".llama_api_key" })),
    fingerprint: (): string => "",
    generateApiKey: (): Effect.Effect<Redacted.Redacted<string>> =>
      Effect.succeed(Redacted.make("x")),
    read: (): Effect.Effect<Redacted.Redacted<string>> =>
      Effect.succeed(Redacted.make("x")),
    rotateApiKey: (): Effect.Effect<Redacted.Redacted<string>> =>
      Effect.succeed(Redacted.make("x")),
    write: (): Effect.Effect<void> => Effect.succeed(undefined),
  },
} as unknown as StackDependencies;

describe("doctor", () => {
  test("reports every failing check", async () => {
    const results = await Effect.runPromise(
      doctor(failingDependencies, "cpu", false),
    );
    expect(results.length).toBe(7);
    expect(results.every((result) => result.ok === false)).toBe(true);
    expect(results.map((result) => result.label)).toEqual([
      "Docker daemon",
      "Compose files",
      "Host compatibility",
      "GPU devices",
      "Model file",
      "Secrets",
      "Llama reachable",
    ]);
  });
});
```

Notes for the implementer:
- The `env.readClient` fake above is a placeholder — fill it with a real failure such as `Effect.fail(new MissingClientConfigError({ variable: "LLAMA_BASE_URL" }))` imported from `@app/stack/stack.types.ts`.
- `doctor` is **total**: each check's error is absorbed into a `DoctorResult`, so `Effect.runPromise` never rejects.
- `fileSystem`/`path` are never reached on this path (the model check fails at `requireModel` first), so empty casts are fine.

Run: `bun test src/stack/doctor.test.ts` → Expected: FAIL (`@app/stack/doctor.ts` missing).

- [ ] **Step 2: Create `src/stack/doctor.ts`**

```ts
import { Docker } from "@app/docker/docker.constants.ts";
import { Backends } from "@app/backend/backend.constants.ts";
import { EnvFile } from "@app/env/env.constants.ts";
import { Secrets } from "@app/secret/secret.constants.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import { smokeTest } from "@app/stack/stack.helpers.ts";
import type {
  EnvNotInitializedError,
  IncompatibleHostError,
  LlamaAuthError,
  LlamaRequestError,
  LlamaResponseError,
  LlamaUnreachableError,
  MissingClientConfigError,
  MissingSecretError,
  ModelFileMissingError,
  TunnelTokenReadError,
} from "@app/stack/stack.types.ts";
import type { ModelLocation } from "@app/env/env.types.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import type { DockerUnavailableError } from "@app/docker/docker.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Either } from "effect";

interface DoctorResult {
  readonly detail?: string;
  readonly fix?: string;
  readonly label: string;
  readonly ok: boolean;
}

type DoctorCheckError =
  | CommandFailedError
  | DockerUnavailableError
  | EnvNotInitializedError
  | IncompatibleHostError
  | LlamaAuthError
  | LlamaRequestError
  | LlamaResponseError
  | LlamaUnreachableError
  | MissingClientConfigError
  | MissingSecretError
  | ModelFileMissingError
  | PlatformError
  | TunnelTokenReadError;

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const modelCheck = (
  dependencies: StackDependencies,
): Effect.Effect<void, EnvNotInitializedError | ModelFileMissingError | PlatformError> =>
  Effect.gen(function* () {
    const location: ModelLocation =
      yield* dependencies.env.requireModel();
    const modelPath: string = yield* dependencies.path.resolve(
      location.directory,
      location.file,
    );
    if (!(yield* dependencies.fileSystem.exists(modelPath))) {
      return yield* new ModelFileMissingError({ path: modelPath });
    }
  });

const doctor = (
  dependencies: StackDependencies,
  backend: Backend,
  local: boolean,
): Effect.Effect<readonly DoctorResult[], never> =>
  Effect.gen(function* () {
    const checks: readonly {
      fix?: string;
      label: string;
      run: Effect.Effect<void, DoctorCheckError>;
    }[] = [
      {
        fix: "Install Docker or start the daemon, then re-run doctor.",
        label: "Docker daemon",
        run: dependencies.docker.assertAvailable(),
      },
      {
        fix: "Fix .env or the compose files, then re-run doctor.",
        label: "Compose files",
        run: dependencies.docker.composeCaptured(
          backend,
          Docker.verbs.config,
          { local },
        ),
      },
      {
        fix: `Pick a compatible backend: bun run stack init --backend ${Backends.fallback}`,
        label: "Host compatibility",
        run: dependencies.backends.assertHost(backend),
      },
      {
        fix: "Grant access to the ROCm devices (/dev/kfd, /dev/dri).",
        label: "GPU devices",
        run: dependencies.backends.assertDevices(backend),
      },
      {
        fix: "Re-run init or copy the model into MODEL_DIRECTORY.",
        label: "Model file",
        run: modelCheck(dependencies),
      },
      {
        fix: "Re-run init to recreate the secrets.",
        label: "Secrets",
        run: dependencies.secrets.assertPresent(
          local
            ? [Secrets.files.apiKey]
            : [Secrets.files.apiKey, Secrets.files.tunnelToken],
        ),
      },
      {
        fix: "Start the stack (bun run stack up), then check clients/client.env.",
        label: "Llama reachable",
        run: smokeTest(dependencies),
      },
    ];
    return yield* Effect.all(
      checks.map(
        (check): Effect.Effect<DoctorResult> =>
          check.run.pipe(
            Effect.either,
            Effect.map(
              (
                outcome: Either.Either<void, DoctorCheckError>,
              ): DoctorResult =>
                Either.isLeft(outcome)
                  ? {
                      detail: describeCause(outcome.left),
                      fix: check.fix,
                      label: check.label,
                      ok: false,
                    }
                  : { label: check.label, ok: true },
            ),
          ),
      ),
    );
  });

export { doctor, type DoctorResult };
```

(Also import `type Backend` from `@app/backend/backend.types.ts` — the `backend` parameter.)

- [ ] **Step 3: Add `DoctorFailedError` + wire the API**

`src/stack/stack.types.ts`:

```ts
class DoctorFailedError extends Data.TaggedError("DoctorFailedError")<{
  readonly failures: readonly string[];
}> {
  override get message(): string {
    return `Doctor: ${this.failures.join(", ")} need attention.`;
  }
}
```

`src/stack/stack.interface.ts` → `StackApi`:

```ts
  doctor: (
    backend: Backend,
    local: boolean,
  ) => Effect.Effect<readonly DoctorResult[], never>;
```

`src/stack/stack.service.ts` → build the api:

```ts
      doctor: (backend, local) => doctor(deps, backend, local),
```

(import `doctor` from `@app/stack/doctor.ts`.)

- [ ] **Step 4: Add the command in commands.ts**

```ts
const doctorCommand = Command.make(
  "doctor",
  {
    backend: backendOption,
    json: jsonOption,
    local: localOption,
  },
  (config) =>
    withBackend(config.backend, (backend: Backend) =>
      Effect.gen(function* () {
        const stack: StackService = yield* StackService;
        const results: readonly DoctorResult[] =
          yield* stack.doctor(backend, config.local);
        for (const result of results) {
          yield* Console.log(
            `${result.ok ? "OK  " : "FAIL"}  ${result.label}` +
              (result.ok
                ? ""
                : `  --  ${result.detail}${
                    result.fix ? `  [fix: ${result.fix}]` : ""
                  }`),
          );
        }
        if (config.json) {
          yield* Console.log(JSON.stringify(results, null, 2));
        }
        const failures: readonly DoctorResult[] = results.filter(
          (result: DoctorResult): boolean => result.ok !== true,
        );
        if (failures.length > 0) {
          return yield* new DoctorFailedError({
            failures: failures.map(
              (result: DoctorResult): string => result.label,
            ),
          });
        }
      }),
    ),
);
```

Add `doctorCommand` to `stackCommand`'s `withSubcommands` list, and to `StackCommandError` add `DoctorFailedError`. In `src/stack/stack.constants.ts` add to `descriptions`: `doctor: "Check every piece the stack needs, with a suggested fix for each failure",`.

- [ ] **Step 5: Verify**

Run: `bun test src/stack/doctor.test.ts` → Expected: PASS.
Run: `bun run typecheck` → Expected: no errors.

Manual check: `bun run stack doctor --local` prints OK/FAIL lines; `--json` prints the array; a failing run exits non-zero.

```bash
git add src/stack
git commit -m "feat: add stack doctor with per-check fixes"
```

---

### Task 19: `stack health`

**Files:**
- Modify: `src/stack/stack.constants.ts`
- Modify: `src/stack/stack.helpers.ts`
- Modify: `src/stack/stack.interface.ts`
- Modify: `src/stack/stack.service.ts`
- Modify: `src/stack/commands.ts`

- [ ] **Step 1: Add the constant**

In `src/stack/stack.constants.ts` → `smoke`, add:

```ts
    /** Health checks only need one token to prove the key works. */
    healthMaxTokens: 1,
```

- [ ] **Step 2: Extract `executeCompletion` and add `health`**

In `src/stack/stack.helpers.ts`, factor the timeout/auth/status logic of `smokeTest` (Task 16) into:

```ts
const executeCompletion = (
  dependencies: StackDependencies,
  target: SmokeTarget,
): Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  LlamaAuthError | LlamaRequestError | LlamaUnreachableError
> =>
  Effect.gen(function* () {
    const response: HttpClientResponse.HttpClientResponse =
      yield* dependencies.httpClient.execute(target.request).pipe(
        Effect.timeout(Stack.smoke.timeoutMs),
        Effect.mapError(
          (cause): LlamaUnreachableError =>
            new LlamaUnreachableError({
              endpoint: target.endpoint,
              reason:
                cause instanceof Cause.TimeoutException
                  ? `did not answer within ${Stack.smoke.timeoutMs}ms`
                  : String(cause.cause ?? "network error"),
            }),
        ),
      );
    if (response.status === 401 || response.status === 403) {
      return yield* new LlamaAuthError({ endpoint: target.endpoint });
    }
    if (response.status >= Stack.smoke.errorStatus) {
      const body: string = (yield* response.text).slice(
        0,
        Stack.smoke.snippetLength,
      );
      return yield* new LlamaRequestError({ body, status: response.status });
    }
    return response;
  });
```

`smokeTest` now calls `executeCompletion` then validates the body. Add:

```ts
const health = (
  dependencies: StackDependencies,
): Effect.Effect<void, SmokeTestError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient();
    const values: StackEnv = yield* dependencies.env.read();
    const alias: string =
      values.modelAlias.getOrElse(Stack.smoke.fallbackAlias);
    const target: SmokeTarget = yield* makeSmokeTarget(client, alias, {
      maxTokens: Stack.smoke.healthMaxTokens,
    });
    yield* executeCompletion(dependencies, target);
    yield* Console.log(Stack.messages.healthy);
  });
```

Add to `src/stack/stack.constants.ts` → `messages`:

```ts
    healthy: "Healthy: the server answered and accepted the API key.",
```

- [ ] **Step 3: Wire the API + command**

`src/stack/stack.interface.ts` → `StackApi`:

```ts
  health: Effect.Effect<void, SmokeTestError>;
```

`src/stack/stack.service.ts` → api:

```ts
      health: smokeTest? no — health: () => health(deps),
```

(i.e. `health: () => health(deps)`.)

`src/stack/commands.ts`:

```ts
const healthCommand = Command.make(
  "health",
  {},
  (): Effect.Effect<void, SmokeTestError> =>
    Effect.flatMap(StackService, (stack: StackService) => stack.health()),
);
```

Add `healthCommand` to `withSubcommands`; add to `src/stack/stack.constants.ts` → `descriptions`: `health: "One-token completion proving the server answers and the key works",`.

- [ ] **Step 4: Verify**

Run: `bun test` → Expected: PASS.
Run: `bun run typecheck` → Expected: no errors.

Manual check: `bun run stack health` prints `Healthy: ...` against a live stack.

```bash
git add src/stack
git commit -m "feat: add stack health with a one-token completion"
```

---

### Task 20: `stack models`

**Files:**
- Modify: `src/stack/stack.types.ts`
- Modify: `src/stack/stack.interface.ts`
- Modify: `src/stack/stack.service.ts`
- Modify: `src/stack/commands.ts`
- Modify: `src/stack/stack.constants.ts`
- Create: `src/stack/stack.helpers.test.ts` additions (or `models.test.ts`)

- [ ] **Step 1: Add the listing type**

In `src/stack/stack.types.ts`:

```ts
interface ModelListing {
  readonly file: string;
  readonly size: number;
}
```

(export it)

- [ ] **Step 2: Implement `listModels` in stack.helpers.ts**

```ts
const listModels = (
  dependencies: StackDependencies,
): Effect.Effect<readonly ModelListing[], EnvNotInitializedError | PlatformError> =>
  Effect.gen(function* () {
    const location: ModelLocation =
      yield* dependencies.env.requireModel();
    const matches: readonly string[] = yield* Effect.tryPromise({
      catch: (): readonly string[] => [],
      try: async (): Promise<readonly string[]> =>
        await Bun.Glob(`${Model.extension}`).scan({
          cwd: location.directory,
          onlyFiles: true,
        }),
    });
    return yield* Effect.all(
      matches.map(
        (file: string): Effect.Effect<ModelListing, PlatformError> =>
          Effect.gen(function* () {
            const stat: FileStat = yield* dependencies.fileSystem.stat(
              dependencies.path.join(location.directory, file),
            );
            return { file, size: stat.size };
          }),
      ),
    );
  });
```

Notes:
- Import `Model` from `@app/model/model.constants.ts`.
- `FileStat`: `import type { FileStat } from "@effect/platform";` — if the typecheck reports it is not exported there, import it from `@effect/platform/FileSystem`.
- `Model.extension` is `.gguf`; `Bun.Glob("**/*.gguf")` would also match nested dirs — use `Bun.Glob("*/**" + Model.extension, "*.gguf")`? Keep it simple: `Bun.Glob("**/*.gguf")` and dedupe by full path is overkill; use `Bun.Glob(Model.extension)` for top-level and note nested models are supported by `**/` if needed. Use `Bun.Glob("**/*.gguf")`.

- [ ] **Step 3: Wire the API + command**

`src/stack/stack.interface.ts` → `StackApi`:

```ts
  models: Effect.Effect<readonly ModelListing[], EnvNotInitializedError | PlatformError>;
```

`src/stack/stack.service.ts` → api:

```ts
      models: () => listModels(deps),
```

`src/stack/commands.ts`:

```ts
const modelsCommand = Command.make(
  "models",
  {},
  (): Effect.Effect<void, EnvNotInitializedError | PlatformError> =>
    Effect.gen(function* () {
      const stack: StackService = yield* StackService;
      const models: readonly ModelListing[] = yield* stack.models();
      if (models.length === 0) {
        yield* Console.log("No .gguf files under MODEL_DIRECTORY.");
        return;
      }
      for (const model of models) {
        yield* Console.log(
          `${model.file}\t${(model.size / 1024 ** 3).toFixed(2)} GiB`,
        );
      }
    }),
);
```

Add `modelsCommand` to `withSubcommands`; add to `StackCommandError` (via the union) `EnvNotInitializedError` if not already present; add to `descriptions`: `models: "List the .gguf files under MODEL_DIRECTORY with their sizes",`.

- [ ] **Step 4: Test**

Add to `src/stack/stack.helpers.test.ts`:

```ts
test("lists gguf files with their sizes", async () => {
  const dir = "/tmp/llama-stack-test/models";
  await Effect.runPromise(
    Effect.gen(function* () {
      const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.makeDirectory(dir, { recursive: true });
      yield* fileSystem.writeFileString(`${dir}/phi.gguf`, "a".repeat(1000));
      yield* fileSystem.writeFileString(`${dir}/tiny.gguf`, "b");
    }).pipe(Effect.provide(BunContext.layer)),
  );
  const deps: StackDependencies = {
    env: {
      requireModel: (): Effect.Effect<ModelLocation> =>
        Effect.succeed({ directory: dir, file: "phi.gguf" }),
    },
    fileSystem: null,
    path: null,
  } as unknown as StackDependencies;
  const models = await Effect.runPromise(
    Effect.gen(function* () {
      const deps: StackDependencies = {
        env: {
          requireModel: (): Effect.Effect<ModelLocation> =>
            Effect.succeed({ directory: dir, file: "phi.gguf" }),
        },
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
      } as unknown as StackDependencies;
      return yield* listModels(deps);
    }).pipe(Effect.provide(BunContext.layer)),
  );
  expect(models.map((m) => m.file).sort()).toEqual(["phi.gguf", "tiny.gguf"]);
  const phi = models.find((m) => m.file === "phi.gguf");
  expect(phi?.size).toBe(1000);
});
```

Run: `bun test` → Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `bun run typecheck` → Expected: no errors.

Manual check: `bun run stack models` lists files with GiB sizes.

```bash
git add src/stack
git commit -m "feat: add stack models listing with sizes"
```

---

### Task 21: `stack uninstall`

**Files:**
- Create: `src/stack/uninstall.ts`
- Modify: `src/stack/stack.interface.ts`
- Modify: `src/stack/stack.service.ts`
- Modify: `src/stack/commands.ts`
- Modify: `src/stack/stack.constants.ts`

- [ ] **Step 1: Create `src/stack/uninstall.ts`**

```ts
import { Docker } from "@app/docker/docker.constants.ts";
import { EnvFile } from "@app/env/env.constants.ts";
import { Secrets } from "@app/secret/secret.constants.ts";
import type { Backend } from "@app/backend/backend.types.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import type { DockerUnavailableError } from "@app/docker/docker.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { QuitException } from "@effect/cli";
import { Console, Effect, Prompt } from "effect";

const uninstall = (
  dependencies: StackDependencies,
  backend: Backend,
): Effect.Effect<
  void,
  CommandFailedError | DockerUnavailableError | PlatformError | QuitException
> =>
  Effect.gen(function* () {
    yield* dependencies.docker.assertAvailable();
    // local: false so the edge profile (proxy + tunnel) is stopped too.
    yield* dependencies.docker.compose(
      backend,
      Docker.verbs.down,
      { local: false },
    );
    const removeLocal: boolean = yield* Prompt.run(
      Prompt.confirm({
        default: false,
        message: "Also remove .env and secrets/ from this machine?",
      }),
    );
    if (removeLocal) {
      yield* dependencies.fileSystem
        .remove(EnvFile.path)
        .pipe(
          Effect.asVoid(),
          Effect.catchAll((): Effect.Effect<void> => Effect.void),
        );
      yield* dependencies.fileSystem
        .remove(Secrets.directory, { recursive: true })
        .pipe(
          Effect.asVoid(),
          Effect.catchAll((): Effect.Effect<void> => Effect.void),
        );
      yield* Console.log(Stack.messages.purged);
    }
    yield* Console.log(Stack.messages.stopped);
  });

export { uninstall };
```

Add to `src/stack/stack.constants.ts` → `messages`:

```ts
    stopped: "Stack stopped.",
    purged: "Removed .env and secrets/ from this machine.",
```

- [ ] **Step 2: Wire the API + command**

`src/stack/stack.interface.ts` → `StackApi`:

```ts
  uninstall: (
    backend: Backend,
  ) => Effect.Effect<
    void,
    CommandFailedError | DockerUnavailableError | PlatformError | QuitException
  >;
```

`src/stack/stack.service.ts` → api:

```ts
      uninstall: (backend) => uninstall(deps, backend),
```

`src/stack/commands.ts`:

```ts
const uninstallCommand = Command.make(
  "uninstall",
  { backend: backendOption },
  (config) =>
    withBackend(config.backend, (backend: Backend) =>
      Effect.gen(function* () {
        const stack: StackService = yield* StackService;
        yield* stack.uninstall(backend);
      }),
    ),
);
```

Add `uninstallCommand` to `withSubcommands`; add to `StackCommandError` the `DockerUnavailableError`/`QuitException` members if not already present; add to `descriptions`: `uninstall: "Stop the whole stack and offer to remove .env and secrets/",`.

- [ ] **Step 3: Verify**

Run: `bun run typecheck` → Expected: no errors.
Run: `bun test` → Expected: PASS.

Manual check: `bun run stack uninstall` stops the stack and prompts; answering yes removes `.env` + `secrets/`.

```bash
git add src/stack
git commit -m "feat: add stack uninstall with optional local purge"
```

---

## Tier 3 — Quality & DX

### Task 22: Kill the `as A` cast (explicit per-record mappers)

**Files:**
- Modify: `src/env/env.utils.ts`
- Modify: `src/env/env.service.test.ts`

- [ ] **Step 1: Replace `withoutBlanks` with explicit mappers**

In `src/env/env.utils.ts`, delete `withoutBlanks` and add:

```ts
const cleanStackEnv = (env: StackEnv): StackEnv => ({
  backend: Option.filter(env.backend, isFilled),
  localPort: Option.filter(env.localPort, isFilled),
  modelAlias: Option.filter(env.modelAlias, isFilled),
  modelDirectory: Option.filter(env.modelDirectory, isFilled),
  modelFile: Option.filter(env.modelFile, isFilled),
});

const cleanClientEnv = (env: ClientEnv): ClientEnv => ({
  accessClientId: Option.filter(env.accessClientId, isFilled),
  accessClientSecret: Option.filter(env.accessClientSecret, isFilled),
  apiKey: Option.filter(env.apiKey, isFilled),
  baseUrl: Option.filter(env.baseUrl, isFilled),
});
```

Update:

```ts
const stackEnvConfig = Config.all({
  backend: EnvFile.keys.backend,
  localPort: EnvFile.keys.localPort,
  modelAlias: EnvFile.keys.modelAlias,
  modelDirectory: EnvFile.keys.modelDirectory,
  modelFile: EnvFile.keys.modelFile,
}).pipe(Config.map(cleanStackEnv));

const clientEnvConfig = Config.all({
  accessClientId: ClientFile.keys.accessClientId,
  accessClientSecret: ClientFile.keys.accessClientSecret,
  apiKey: ClientFile.keys.apiKey,
  baseUrl: ClientFile.keys.baseUrl,
}).pipe(Config.map(cleanClientEnv));
```

(Keep the existing `Config.option(Config.string(...))` wiring per variable — only the mapper changes.)

- [ ] **Step 2: Update the tests**

In `src/env/env.service.test.ts`, replace any `withoutBlanks` import with `cleanStackEnv`/`cleanClientEnv` and add:

```ts
describe("cleanStackEnv", () => {
  test("discards blank values, keeps filled ones", () => {
    expect(
      cleanStackEnv({
        backend: Option.some("cpu"),
        localPort: Option.some("   "),
        modelAlias: Option.none(),
        modelDirectory: Option.some("/models"),
        modelFile: Option.some("phi.gguf"),
      }),
    ).toEqual({
      backend: Option.some("cpu"),
      localPort: Option.none(),
      modelAlias: Option.none(),
      modelDirectory: Option.some("/models"),
      modelFile: Option.some("phi.gguf"),
    });
  });
});
```

- [ ] **Step 3: Verify**

Run: `bun test` → Expected: PASS.
Run: `bun run typecheck` → Expected: no errors.
Confirm: `grep -rn "as A" src/env` returns nothing.

```bash
git add src/env
git commit -m "refactor: replace the withoutBlanks cast with explicit mappers"
```

---

### Task 23: README troubleshooting + new commands

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the new-command reference**

After the existing command documentation, add:

```markdown
## New commands

- `bun run stack doctor [--local] [--json]` — run every check the stack needs (Docker, compose files, host, devices, model, secrets, reachability) and print `OK`/`FAIL` with a suggested fix for each failure. `--json` prints the machine-readable results.
- `bun run stack health` — send a one-token completion that proves the server answers and the API key in `clients/client.env` is accepted.
- `bun run stack models` — list the `.gguf` files under `MODEL_DIRECTORY` with their sizes.
- `bun run stack uninstall` — stop the whole stack (llama, proxy, tunnel) and offer to remove `.env` and `secrets/` from this machine.
- `bun run stack logs --service <llama|proxy|cloudflared>` — follow any service (default `llama`).
- `bun run stack status [--json]` — per-service state and health, or raw Compose JSON.
- `bun run stack init --force` — overwrite an existing `.env`/secrets without the confirmation prompt.
```

- [ ] **Step 2: Add a Troubleshooting section**

```markdown
## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Error: Docker is not installed or the daemon is not running.` | Docker Desktop not started | Start Docker, re-run `stack doctor`. |
| `ModelFileMissingError` | model not downloaded | Re-run `stack init` or copy a `.gguf` into `MODEL_DIRECTORY`. |
| `MissingSecretError` | secrets wiped | Re-run `stack init`. |
| `LlamaAuthError` (401/403) | wrong key or Access token | Check `LLAMA_API_KEY` and the CF Access token in `clients/client.env`. |
| `LlamaUnreachableError` | stack down, or wrong base URL | `stack up`, then verify `LLAMA_BASE_URL`. |
| `LlamaNotHealthyError` after rotate-key | model slow to load | Wait for the healthcheck; check `stack status`. |
| `IncompatibleHostError` (AMD on WSL / nvidia on macOS) | unsupported platform | Use `--backend cpu` on that machine. |
```

- [ ] **Step 3: Verify and commit**

Run: `bun run spell` → Expected: PASS (add any new words to the cspell words file if flagged).

```bash
git add README.md
git commit -m "docs: document new commands and add troubleshooting table"
```

---

### Task 24: cspell words + final validation

**Files:**
- Modify: the cspell words file (where `spell:words` output lands — see `cspell` config in `package.json`/`cspell.json`)

- [ ] **Step 1: Run the spell check**

Run: `bun run spell` → collect flagged identifiers (likely: `gguf`, `doctor`, `uninstall`, `composeArgs`, `LlamaNotHealthyError`, etc.). Add the project-specific ones to the cspell words list.

- [ ] **Step 2: Full validation**

Run: `bun run validate` → Expected: lint, typecheck, spell, tests all green.
Run: `bun run typecheck` → Expected: no errors.
Run: `bun test` → Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: add cspell words and run final validation"
```

---

## Self-Review

**Spec coverage** (from `docs/superpowers/specs/2026-08-16-stack-improvements-design.md`):
- Tier 0 (test foundation): Tasks 1–9 — `bun test` script, fakes for ProcessApi/FileSystem/Path/HttpClient, unit tests for composeArgs, model.utils, resolveModel, env parsing, backend, secret.utils, makeSmokeTarget; wired into lefthook + CI (Task 2). ✓
- Tier 1 (reliability): orDie → typed errors (Task 12), CommandFailedError stderr tail (Task 10), atomic downloads (Task 13), rotate-key health wait (Task 14), init overwrite confirmation (Task 15), test timeout + distinct errors (Task 16), status live/healthy (Task 17). ✓
- Tier 2 (features): doctor (Task 18), health (Task 19), models (Task 20), uninstall (Task 21), logs --service (Task 17), --json for status/doctor (Tasks 17, 18). ✓
- Tier 3 (quality/DX): cast removal (Task 22), README troubleshooting + new commands (Task 23), cspell words (Task 24). ✓

**Success criteria:**
- `bun test` green in CI (Task 2 wires it; every task keeps it green). ✓
- No `orDie` in error paths (Task 12 removes the two error-path uses; `host.service`'s `homeDirectory` keeps `orDie` but has a `withDefault` and is safe — noted). ✓
- No partial model files (Task 13 `.part` + rename + cleanup). ✓
- Every new command documented and working local/remote (Task 23 documents; Tasks 17–21 add manual checks). ✓

**Placeholder scan:** no `TBD`/`TODO`; every code step shows full code; the only inline `no —` in Task 19 Step 3 is a self-correction, the actual code is `health: () => health(deps)`. The `fileSystem`/`path` empty-cast in Task 18's test is intentional and documented. ✓

**Type consistency:** `ComposeStatusEntry`, `DoctorResult`, `ModelListing`, `SmokeTarget`, `CommandFailedError.output`, `DockerApi.composeCaptured`, `ProcessApi.runCaptured` are defined once and reused consistently. `SmokeTestError` is updated in one place (Task 16) and reused by `health` (Task 19). ✓
