import { describe, expect, test } from "bun:test";
import { makeModelSource } from "@app/cli/resource/model/model.factory.ts";
import type { ModelSource } from "@app/cli/resource/model/model.types.ts";
import { ModelSourceError } from "@app/cli/resource/model/model.types.ts";
import { Effect, Either, Option } from "effect";

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
        include: options.include ?? Option.none(),
        modelFile: options.modelFile ?? Option.none(),
        modelUrl: options.modelUrl ?? Option.none(),
        repository: options.repository ?? Option.none(),
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
      evaluate({ modelUrl: Option.some("https://example.org/qwen2.gguf") }),
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
    expect(Either.isLeft(evaluate({}))).toBe(true);
  });

  test("rejects two sources and counts them", () => {
    const result: Either.Either<ModelSource, ModelSourceError> = evaluate({
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
