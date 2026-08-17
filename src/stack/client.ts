import type { ClientEnv, StackEnv } from "@app/env/env.types.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type {
  ServedModelsError,
  SmokeTestError,
  StackDependencies,
} from "@app/stack/stack.interface.ts";
import {
  LlamaAuthError,
  LlamaRequestError,
  LlamaResponseError,
  LlamaUnreachableError,
  type ModelListing,
} from "@app/stack/stack.types.ts";
import type { SmokeTarget } from "@app/stack/stack.utils.ts";
import { makeModelsTarget, makeSmokeTarget } from "@app/stack/stack.utils.ts";
import { HttpClientResponse } from "@effect/platform";
import { Console, Duration, Effect, Option, Schema } from "effect";

/** The answer must be an OpenAI chat completion, not merely an HTTP 200. */
const completionResponseSchema = Schema.Struct({
  choices: Schema.NonEmptyArray(
    Schema.Struct({ message: Schema.Struct({ content: Schema.String }) }),
  ),
});

const modelsResponseSchema = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: Schema.String })),
});

type CompletionResponse = Schema.Schema.Type<typeof completionResponseSchema>;
type ModelsResponse = Schema.Schema.Type<typeof modelsResponseSchema>;

const describeBody = (reason: string): string =>
  reason.slice(0, Stack.smoke.snippetLength);

/**
 * Every client-side call goes through here, so "nothing answered", "the key was
 * refused" and "the server complained" stay three different diagnoses instead
 * of one opaque HTTP error.
 */
const execute = (
  dependencies: StackDependencies,
  target: SmokeTarget,
): Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  LlamaAuthError | LlamaRequestError | LlamaUnreachableError
> =>
  Effect.gen(function* () {
    const response: HttpClientResponse.HttpClientResponse =
      yield* dependencies.httpClient.execute(target.request).pipe(
        Effect.mapError(
          (cause: Error): LlamaUnreachableError =>
            new LlamaUnreachableError({
              endpoint: target.endpoint,
              reason: describeBody(cause.message),
            }),
        ),
        Effect.timeoutFail({
          duration: Duration.millis(Stack.smoke.timeoutMs),
          onTimeout: (): LlamaUnreachableError =>
            new LlamaUnreachableError({
              endpoint: target.endpoint,
              reason: `no answer within ${Stack.smoke.timeoutMs}ms`,
            }),
        }),
      );
    if (
      (Stack.smoke.authStatuses as readonly number[]).includes(response.status)
    ) {
      return yield* new LlamaAuthError({ endpoint: target.endpoint });
    }
    if (response.status >= Stack.smoke.errorStatus) {
      const body: string = yield* response.text.pipe(
        Effect.orElseSucceed((): string => ""),
      );
      return yield* new LlamaRequestError({
        body: describeBody(body),
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
        new LlamaResponseError({
          endpoint,
          reason: describeBody(cause.message),
        }),
    ),
  );

/** `${LLAMA_ALIAS}` when `.env` is here, the Compose default otherwise. */
const servedAlias = (
  dependencies: StackDependencies,
): Effect.Effect<string, never> =>
  dependencies.env.read.pipe(
    Effect.map((values: StackEnv): string =>
      Option.getOrElse(
        values.modelAlias,
        (): string => Stack.smoke.fallbackAlias,
      ),
    ),
    Effect.orElseSucceed((): string => Stack.smoke.fallbackAlias),
  );

/**
 * Smoke test, no curl or PowerShell needed. The endpoint and credentials come
 * from `clients/client.env`, so this exercises whatever a client is pointed
 * at, on the client host as well as on the server one.
 */
const smokeTest = (
  dependencies: StackDependencies,
): Effect.Effect<void, SmokeTestError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient;
    const target: SmokeTarget = yield* makeSmokeTarget(
      client,
      yield* servedAlias(dependencies),
    );
    const response: HttpClientResponse.HttpClientResponse = yield* execute(
      dependencies,
      target,
    );
    const completion: CompletionResponse = yield* decode(
      response,
      completionResponseSchema,
      target.endpoint,
    );
    yield* Console.log(completion.choices[0].message.content);
  });

/** Liveness probe: one token is enough to prove the key is accepted. */
const health = (
  dependencies: StackDependencies,
): Effect.Effect<void, SmokeTestError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient;
    const target: SmokeTarget = yield* makeSmokeTarget(
      client,
      yield* servedAlias(dependencies),
      Stack.smoke.healthMaxTokens,
    );
    yield* execute(dependencies, target);
    yield* Console.log(Stack.messages.healthy);
  });

/** What the server itself says it serves; the only listing a client can get. */
const servedModels = (
  dependencies: StackDependencies,
): Effect.Effect<readonly ModelListing[], ServedModelsError> =>
  Effect.gen(function* () {
    const client: ClientEnv = yield* dependencies.env.readClient;
    const target: SmokeTarget = yield* makeModelsTarget(client);
    const response: HttpClientResponse.HttpClientResponse = yield* execute(
      dependencies,
      target,
    );
    const models: ModelsResponse = yield* decode(
      response,
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
