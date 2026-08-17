import { describe, expect, test } from "bun:test";
import type { ClientEnv } from "@app/env/env.types.ts";
import { MissingClientConfigError } from "@app/stack/stack.types.ts";
import type {
  ComposeStatusEntry,
  SmokeTarget,
} from "@app/stack/stack.utils.ts";
import {
  makeCompletionRequest,
  makeModelsTarget,
  makeSmokeTarget,
  parseComposeStatus,
} from "@app/stack/stack.utils.ts";
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
    const target: SmokeTarget = Effect.runSync(
      makeSmokeTarget(client, "phi-3-7b"),
    );
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/chat/completions");
  });

  test("strips trailing slashes from the base url", () => {
    const target: SmokeTarget = Effect.runSync(
      makeSmokeTarget(
        { ...client, baseUrl: Option.some("http://127.0.0.1:8080///") },
        "m",
      ),
    );
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/chat/completions");
  });

  test("adds Access headers only when both variables are present", () => {
    const target: SmokeTarget = Effect.runSync(
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
    const result: Either.Either<SmokeTarget, MissingClientConfigError> =
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
});

describe("makeModelsTarget", () => {
  test("targets the model listing of the same server", () => {
    const target: SmokeTarget = Effect.runSync(makeModelsTarget(client));
    expect(target.endpoint).toBe("http://127.0.0.1:8080/v1/models");
    expect(target.request.method).toBe("GET");
  });
});

describe("parseComposeStatus", () => {
  test("reads the JSON array shape", () => {
    expect(
      parseComposeStatus(
        JSON.stringify([
          { Health: "healthy", Service: "heartbeat", State: "running" },
          { Service: "llama", State: "running" },
        ]),
      ),
    ).toEqual([
      { health: "healthy", service: "heartbeat", state: "running" },
      { health: "", service: "llama", state: "running" },
    ]);
  });

  test("reads the one-object-per-line shape", () => {
    const lines: string = [
      JSON.stringify({
        Health: "starting",
        Service: "llama",
        State: "running",
      }),
      JSON.stringify({ Health: "healthy", Service: "proxy", State: "running" }),
    ].join("\n");
    const services: readonly ComposeStatusEntry[] = parseComposeStatus(lines);
    expect(
      services.map((entry: ComposeStatusEntry): string => entry.service),
    ).toEqual(["llama", "proxy"]);
  });

  test("treats empty and malformed output as no container", () => {
    expect(parseComposeStatus("")).toEqual([]);
    expect(parseComposeStatus("not-json")).toEqual([]);
    expect(parseComposeStatus(JSON.stringify([{ State: "running" }]))).toEqual(
      [],
    );
  });
});
