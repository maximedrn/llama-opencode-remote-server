import { Client, trailingSlash } from "@app/cli/client/client.constants.ts";
import {
  type ClientTarget,
  type CompletionRequest,
  MissingClientConfigError,
} from "@app/cli/client/client.types.ts";
import { ClientFile } from "@app/cli/env/env.constants.ts";
import type { ClientEnv } from "@app/cli/env/env.types.ts";
import { HttpClientRequest } from "@effect/platform";
import { Effect, Option, Redacted } from "effect";

/** OpenAI-compatible payload, so the field names are not ours to rename. */
const makeCompletionRequest = (
  model: string,
  maxTokens: number = Client.smoke.maxTokens,
): CompletionRequest => ({
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
  max_tokens: maxTokens,
  messages: [{ content: Client.smoke.prompt, role: Client.smoke.role }],
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

/** Empty locally: Nginx would strip these headers anyway. */
const accessHeaders = (client: ClientEnv): Record<string, string> =>
  Option.match(Option.all([client.accessClientId, client.accessClientSecret]), {
    onNone: (): Record<string, string> => ({}),
    onSome: (token: readonly [string, string]): Record<string, string> => ({
      [Client.smoke.headers.accessClientId]: token[0],
      [Client.smoke.headers.accessClientSecret]: token[1],
    }),
  });

/** Base URL of the client configuration, without its trailing slashes. */
const clientBaseUrl = (
  client: ClientEnv,
): Effect.Effect<string, MissingClientConfigError> =>
  requireValue(client.baseUrl, ClientFile.keys.baseUrl).pipe(
    Effect.map((baseUrl: string): string => baseUrl.replace(trailingSlash, "")),
  );

const authorized = (
  client: ClientEnv,
  request: HttpClientRequest.HttpClientRequest,
): Effect.Effect<
  HttpClientRequest.HttpClientRequest,
  MissingClientConfigError
> =>
  requireValue(client.apiKey, ClientFile.keys.apiKey).pipe(
    Effect.map(
      (apiKey: string): HttpClientRequest.HttpClientRequest =>
        request.pipe(
          HttpClientRequest.bearerToken(Redacted.make(apiKey)),
          HttpClientRequest.setHeaders(accessHeaders(client)),
        ),
    ),
  );

/**
 * The request an OpenCode client would send: whatever `client.env` points at,
 * with the Access headers only when that file carries a service token.
 */
const makeSmokeTarget = (
  client: ClientEnv,
  alias: string,
  maxTokens: number = Client.smoke.maxTokens,
): Effect.Effect<ClientTarget, MissingClientConfigError> =>
  Effect.gen(function* () {
    const endpoint: string = `${yield* clientBaseUrl(client)}${Client.smoke.path}`;
    const request: HttpClientRequest.HttpClientRequest = yield* authorized(
      client,
      HttpClientRequest.post(endpoint).pipe(
        HttpClientRequest.bodyUnsafeJson(
          makeCompletionRequest(alias, maxTokens),
        ),
      ),
    );
    return { endpoint, request };
  });

/** Same credentials, against the model listing every client may read. */
const makeModelsTarget = (
  client: ClientEnv,
): Effect.Effect<ClientTarget, MissingClientConfigError> =>
  Effect.gen(function* () {
    const endpoint: string = `${yield* clientBaseUrl(client)}${Client.smoke.modelsPath}`;
    return {
      endpoint,
      request: yield* authorized(client, HttpClientRequest.get(endpoint)),
    };
  });

export { makeCompletionRequest, makeModelsTarget, makeSmokeTarget };
