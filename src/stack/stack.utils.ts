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

/** One container, as `docker compose ps --format json` describes it. */
interface ComposeStatusEntry {
  readonly health: string;
  readonly service: string;
  readonly state: string;
}

interface SmokeTarget {
  readonly endpoint: string;
  readonly request: HttpClientRequest.HttpClientRequest;
}

/** OpenAI-compatible payload, so the field names are not ours to rename. */
const makeCompletionRequest = (
  model: string,
  maxTokens: number = Stack.smoke.maxTokens,
): CompletionRequest => ({
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
  max_tokens: maxTokens,
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

/** Empty locally: Nginx would strip these headers anyway. */
const accessHeaders = (client: ClientEnv): Record<string, string> =>
  Option.match(Option.all([client.accessClientId, client.accessClientSecret]), {
    onNone: (): Record<string, string> => ({}),
    onSome: (token: readonly [string, string]): Record<string, string> => ({
      [Stack.smoke.headers.accessClientId]: token[0],
      [Stack.smoke.headers.accessClientSecret]: token[1],
    }),
  });

/** Base URL of the client configuration, without its trailing slashes. */
const clientBaseUrl = (
  client: ClientEnv,
): Effect.Effect<string, MissingClientConfigError> =>
  requireValue(client.baseUrl, ClientFile.keys.baseUrl).pipe(
    Effect.map((baseUrl: string): string => baseUrl.replace(trailingSlash, "")),
  );

/**
 * The request an OpenCode client would send: whatever `client.env` points at,
 * with the Access headers only when that file carries a service token.
 */
const makeSmokeTarget = (
  client: ClientEnv,
  alias: string,
  maxTokens: number = Stack.smoke.maxTokens,
): Effect.Effect<SmokeTarget, MissingClientConfigError> =>
  Effect.gen(function* () {
    const endpoint: string = `${yield* clientBaseUrl(client)}${Stack.smoke.path}`;
    const apiKey: string = yield* requireValue(
      client.apiKey,
      ClientFile.keys.apiKey,
    );
    const request: HttpClientRequest.HttpClientRequest = HttpClientRequest.post(
      endpoint,
    ).pipe(
      HttpClientRequest.bearerToken(Redacted.make(apiKey)),
      HttpClientRequest.setHeaders(accessHeaders(client)),
      HttpClientRequest.bodyUnsafeJson(makeCompletionRequest(alias, maxTokens)),
    );
    return { endpoint, request };
  });

/** Same credentials, against the model listing every client may read. */
const makeModelsTarget = (
  client: ClientEnv,
): Effect.Effect<SmokeTarget, MissingClientConfigError> =>
  Effect.gen(function* () {
    const endpoint: string = `${yield* clientBaseUrl(client)}${Stack.smoke.modelsPath}`;
    const apiKey: string = yield* requireValue(
      client.apiKey,
      ClientFile.keys.apiKey,
    );
    const request: HttpClientRequest.HttpClientRequest = HttpClientRequest.get(
      endpoint,
    ).pipe(
      HttpClientRequest.bearerToken(Redacted.make(apiKey)),
      HttpClientRequest.setHeaders(accessHeaders(client)),
    );
    return { endpoint, request };
  });

const readString = (record: Record<string, unknown>, key: string): string => {
  const value: unknown = record[key];
  return typeof value === "string" ? value : "";
};

const toStatusEntry = (entry: unknown): readonly ComposeStatusEntry[] => {
  if (typeof entry !== "object" || Option.isNone(Option.fromNullable(entry))) {
    return [];
  }
  const record: Record<string, unknown> = entry as Record<string, unknown>;
  const service: string = readString(record, "Service");
  return service.length === 0
    ? []
    : [
        {
          health: readString(record, "Health"),
          service,
          state: readString(record, "State"),
        },
      ];
};

const parseJson = (text: string): Option.Option<unknown> =>
  Option.liftThrowable((value: string): unknown => JSON.parse(value))(text);

/**
 * Compose has shipped both shapes for `ps --format json`: a JSON array, and one
 * object per line. Unreadable output means no container, which is what every
 * caller already treats as "not ready yet".
 */
const parseComposeStatus = (json: string): readonly ComposeStatusEntry[] => {
  const trimmed: string = json.trim();
  if (trimmed.length === 0) return [];
  return Option.match(parseJson(trimmed), {
    onNone: (): readonly ComposeStatusEntry[] =>
      trimmed
        .split("\n")
        .flatMap((line: string): readonly ComposeStatusEntry[] =>
          Option.match(parseJson(line), {
            onNone: (): readonly ComposeStatusEntry[] => [],
            onSome: toStatusEntry,
          }),
        ),
    onSome: (value: unknown): readonly ComposeStatusEntry[] =>
      Array.isArray(value)
        ? value.flatMap(toStatusEntry)
        : toStatusEntry(value),
  });
};

export {
  type ComposeStatusEntry,
  makeCompletionRequest,
  makeModelsTarget,
  makeSmokeTarget,
  parseComposeStatus,
  type SmokeTarget,
};
