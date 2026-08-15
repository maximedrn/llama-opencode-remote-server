import { ClientFile } from "@app/env/env.constants.ts";
import type { ClientEnv } from "@app/env/env.types.ts";
import { Stack, trailingSlash } from "@app/stack/stack.constants.ts";
import { MissingClientConfigError } from "@app/stack/stack.types.ts";
import { HttpClientRequest } from "@effect/platform";
import { Effect, Option, Redacted } from "effect";

interface CompletionMessage {
  readonly content: string;
  readonly role: string;
}

interface CompletionRequest {
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
  readonly max_tokens: number;
  readonly messages: readonly CompletionMessage[];
  readonly model: string;
}

/** OpenAI-compatible payload, so the field names are not ours to rename. */
const makeCompletionRequest = (model: string): CompletionRequest => ({
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
  max_tokens: Stack.smoke.maxTokens,
  messages: [{ content: Stack.smoke.prompt, role: Stack.smoke.role }],
  model,
});

const requireValue = (
  value: Option.Option<string>,
  variable: string,
): Effect.Effect<string, MissingClientConfigError> =>
  Option.match(value, {
    onNone: (): Effect.Effect<string, MissingClientConfigError> =>
      new MissingClientConfigError({ variable }),
    onSome: (found: string): Effect.Effect<string> => Effect.succeed(found),
  });

interface SmokeTarget {
  readonly endpoint: string;
  readonly request: HttpClientRequest.HttpClientRequest;
}

/**
 * The request an OpenCode client would send: whatever `client.env` points at,
 * with the Access headers only when that file carries a service token.
 */
const makeSmokeTarget = (
  client: ClientEnv,
  alias: string,
): Effect.Effect<SmokeTarget, MissingClientConfigError> =>
  Effect.gen(function* () {
    const baseUrl: string = yield* requireValue(
      client.baseUrl,
      ClientFile.keys.baseUrl,
    );
    const apiKey: string = yield* requireValue(
      client.apiKey,
      ClientFile.keys.apiKey,
    );
    const endpoint: string = `${baseUrl.replace(trailingSlash, "")}${Stack.smoke.path}`;
    /** Empty locally: Nginx would strip these headers anyway. */
    const accessHeaders: Record<string, string> = Option.match(
      Option.all([client.accessClientId, client.accessClientSecret]),
      {
        onNone: (): Record<string, string> => ({}),
        onSome: (token: readonly [string, string]): Record<string, string> => ({
          [Stack.smoke.headers.accessClientId]: token[0],
          [Stack.smoke.headers.accessClientSecret]: token[1],
        }),
      },
    );
    const request: HttpClientRequest.HttpClientRequest = HttpClientRequest.post(
      endpoint,
    ).pipe(
      HttpClientRequest.bearerToken(Redacted.make(apiKey)),
      HttpClientRequest.setHeaders(accessHeaders),
      HttpClientRequest.bodyUnsafeJson(makeCompletionRequest(alias)),
    );
    return { endpoint, request };
  });

export { makeCompletionRequest, makeSmokeTarget, type SmokeTarget };
