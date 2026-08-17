import { describe, expect, test } from "bun:test";
import type { ClientTarget } from "@app/cli/client/client.types.ts";
import { MissingClientConfigError } from "@app/cli/client/client.types.ts";
import {
  makeCompletionRequest,
  makeModelsTarget,
  makeSmokeTarget,
} from "@app/cli/client/client.utils.ts";
import type { ClientEnv } from "@app/cli/env/env.types.ts";
import { Effect, Either, Option } from "effect";

const client: ClientEnv = {
  accessClientId: Option.none(),
  accessClientSecret: Option.none(),
  apiKey: Option.some("llama_test"),
  baseUrl: Option.some("http://127.0.0.1:8080"),
};

describe("makeCompletionRequest", () => {
  test("builds the fixed smoke completion", () => {
    expect(makeCompletionRequest("phi-3-7b")).toEqual({
      // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
      max_tokens: 32,
      messages: [{ content: "Reply with exactly OK", role: "user" }],
      model: "phi-3-7b",
    });
  });

  test("takes a smaller token budget for the health probe", () => {
    expect(makeCompletionRequest("phi", 1).max_tokens).toBe(1);
  });
});

describe("makeSmokeTarget", () => {
  test("targets the chat completions endpoint", () => {
    const target: ClientTarget = Effect.runSync(
      makeSmokeTarget(client, "phi-3-7b"),
    );
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/chat/completions");
  });

  test("strips trailing slashes from the base url", () => {
    const target: ClientTarget = Effect.runSync(
      makeSmokeTarget(
        { ...client, baseUrl: Option.some("http://127.0.0.1:8080///") },
        "m",
      ),
    );
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/chat/completions");
  });

  test("adds Access headers only when both variables are present", () => {
    const target: ClientTarget = Effect.runSync(
      makeSmokeTarget(
        {
          ...client,
          accessClientId: Option.some("id"),
          accessClientSecret: Option.some("secret"),
        },
        "m",
      ),
    );
    expect(target.request.headers["cf-access-client-id"]).toBe("id");
    expect(target.request.headers["cf-access-client-secret"]).toBe("secret");
  });

  test("fails when the base url is missing", () => {
    const result: Either.Either<ClientTarget, MissingClientConfigError> =
      Effect.runSync(
        Effect.either(
          makeSmokeTarget({ ...client, baseUrl: Option.none() }, "m"),
        ),
      );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MissingClientConfigError);
    }
  });

  test("fails when the api key is missing", () => {
    expect(
      Either.isLeft(
        Effect.runSync(
          Effect.either(
            makeSmokeTarget({ ...client, apiKey: Option.none() }, "m"),
          ),
        ),
      ),
    ).toBe(true);
  });
});

describe("makeModelsTarget", () => {
  test("targets the model listing of the same server", () => {
    const target: ClientTarget = Effect.runSync(makeModelsTarget(client));
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/models");
    expect(target.request.method).toBe("GET");
  });
});
