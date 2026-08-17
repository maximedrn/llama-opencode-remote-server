import { Client } from "@app/cli/client/client.constants.ts";
import type {
  ClientCallError,
  ClientDependencies,
  SmokeTestError,
} from "@app/cli/client/client.interface.ts";
import {
  type ClientTarget,
  type CompletionResponse,
  completionResponseSchema,
  LlamaAuthError,
  LlamaRequestError,
  LlamaResponseError,
  LlamaUnreachableError,
  type ModelsResponse,
  modelsResponseSchema,
} from "@app/cli/client/client.types.ts";
import {
  makeModelsTarget,
  makeSmokeTarget,
} from "@app/cli/client/client.utils.ts";
import type { ClientEnv, StackEnv } from "@app/cli/env/env.types.ts";
import type { ModelListing } from "@app/cli/model/model.types.ts";
import { HttpClientResponse } from "@effect/platform";
import { Console, Duration, Effect, Option, type Schema } from "effect";

const shorten = (reason: string): string =>
  reason.slice(0, Client.smoke.snippetLength);

/** Every client-side call goes through here, so failures stay diagnosable. */
const execute = (
  dependencies: ClientDependencies,
  target: ClientTarget,
): Effect.Effect<HttpClientResponse.HttpClientResponse, ClientCallError> =>
  Effect.gen(function* () {
    const response: HttpClientResponse.HttpClientResponse =
      yield* dependencies.httpClient.execute(target.request).pipe(
        Effect.mapError(
          (cause: Error): LlamaUnreachableError =>
            new LlamaUnreachableError({
              endpoint: target.endpoint,
              reason: shorten(cause.message),
            }),
        ),
        Effect.timeoutFail({
          duration: Duration.millis(Client.smoke.timeoutMs),
          onTimeout: (): LlamaUnreachableError =>
            new LlamaUnreachableError({
              endpoint: target.endpoint,
              reason: Client.messages.timedOut(Client.smoke.timeoutMs),
            }),
        }),
      );
    if (
      (Client.smoke.authStatuses as readonly number[]).includes(response.status)
    ) {
      return yield* new LlamaAuthError({ endpoint: target.endpoint });
    }
    if (response.status >= Client.smoke.errorStatus) {
      const body: string = yield* response.text.pipe(
        Effect.orElseSucceed((): string => ""),
      );
      return yield* new LlamaRequestError({
        body: shorten(body),
        status: response.status,
      });
    }
    return response;
  });

const decode = <A, I>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Schema<A, I>,
  endpoint: string,
): Effect.Effect<A, LlamaResponseError> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(
    Effect.mapError(
      (cause: Error): LlamaResponseError =>
        new LlamaResponseError({ endpoint, reason: shorten(cause.message) }),
    ),
  );

/** `${LLAMA_ALIAS}` when `.env` is here, the Compose default otherwise. */
const servedAlias = (dependencies: ClientDependencies): Effect.Effect<string> =>
  dependencies.env.read.pipe(
    Effect.map((values: StackEnv): string =>
      Option.getOrElse(
        values.modelAlias,
        (): string => Client.smoke.fallbackAlias,
      ),
    ),
    Effect.orElseSucceed((): string => Client.smoke.fallbackAlias),
  );

/**
 * Smoke test, no curl or PowerShell needed. The endpoint and credentials come
 * from `clients/client.env`, so this exercises whatever a client is pointed
 * at, on the client host as well as on the server one.
 */
const smokeTest = (
  dependencies: ClientDependencies,
): Effect.Effect<void, SmokeTestError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient;
    const target: ClientTarget = yield* makeSmokeTarget(
      client,
      yield* servedAlias(dependencies),
    );
    const completion: CompletionResponse = yield* decode(
      yield* execute(dependencies, target),
      completionResponseSchema,
      target.endpoint,
    );
    yield* Console.log(completion.choices[0].message.content);
  });

/** Liveness probe: one token is enough to prove the key is accepted. */
const health = (
  dependencies: ClientDependencies,
): Effect.Effect<void, SmokeTestError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient;
    const target: ClientTarget = yield* makeSmokeTarget(
      client,
      yield* servedAlias(dependencies),
      Client.smoke.healthMaxTokens,
    );
    yield* execute(dependencies, target);
    yield* Console.log(Client.messages.healthy);
  });

/** What the server itself says it serves; the only listing a client can get. */
const servedModels = (
  dependencies: ClientDependencies,
): Effect.Effect<readonly ModelListing[], SmokeTestError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient;
    const target: ClientTarget = yield* makeModelsTarget(client);
    const models: ModelsResponse = yield* decode(
      yield* execute(dependencies, target),
      modelsResponseSchema,
      target.endpoint,
    );
    return models.data.map(
      (model: { readonly id: string }): ModelListing => ({
        name: model.id,
        size: Option.none(),
      }),
    );
  });

export { execute, health, servedModels, smokeTest };
