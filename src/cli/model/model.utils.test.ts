// biome-ignore-all lint/security/noSecrets: these are model file names, not credentials.
import { describe, expect, test } from "bun:test";
import {
  defaultModelDirectory,
  fileNameFromUrl,
  modelAlias,
  toPosixPath,
} from "@app/cli/model/model.utils.ts";
import { Option } from "effect";

const orEmpty = (name: Option.Option<string>): string =>
  Option.getOrElse(name, (): string => "");

describe("toPosixPath", () => {
  test("replaces backslashes with slashes", () => {
    expect(toPosixPath("C:\\dev\\.llama\\models")).toBe("C:/dev/.llama/models");
  });
});

describe("defaultModelDirectory", () => {
  test("joins the home directory with .llama/models", () => {
    expect(defaultModelDirectory("/Users/dev")).toBe(
      "/Users/dev/.llama/models",
    );
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
