import { describe, expect, test } from "bun:test";
import { Secrets } from "@app/secret/secret.constants.ts";
import { fingerprint, generateApiKey } from "@app/secret/secret.utils.ts";
import { Either, Encoding } from "effect";

const base64UrlBody: RegExp = /^[A-Za-z0-9_-]+$/;
const hexDigest: RegExp = /^[0-9a-f]{16}$/;

describe("generateApiKey", () => {
  test("is prefixed and base64url-encoded", () => {
    const key: string = generateApiKey();
    expect(key.startsWith(Secrets.apiKey.prefix)).toBe(true);
    const body: string = key.slice(Secrets.apiKey.prefix.length);
    expect(body).toMatch(base64UrlBody);
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
    expect(value).toMatch(hexDigest);
    expect(fingerprint("llama_secret")).toBe(value);
    expect(fingerprint("other")).not.toBe(value);
  });
});
