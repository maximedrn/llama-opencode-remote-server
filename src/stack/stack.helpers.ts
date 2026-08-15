import { HardwareBackends } from "@app/backend/backend.constants";
import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import { makeStackEnv } from "@app/env/env.factory.ts";
import type { StackEnv } from "@app/env/env.types";
import { Host } from "@app/host/host.constants.ts";
import { makeModelSource } from "@app/model/model.factory.ts";
import type { ModelSource, ResolvedModel } from "@app/model/model.types.ts";
import { ModelFileMissingError } from "@app/model/model.types.ts";
import { defaultModelDirectory } from "@app/model/model.utils.ts";
import { Secrets } from "@app/secret/secret.constants.ts";
import { EmptyTunnelTokenError } from "@app/secret/secret.types.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type {
  InitError,
  PreflightError,
  SmokeTestError,
  StackDependencies,
} from "@app/stack/stack.interface.ts";
import type { InitInput } from "@app/stack/stack.types.ts";
import {
  LlamaRequestError,
  LlamaResponseError,
} from "@app/stack/stack.types.ts";
import { makeCompletionRequest } from "@app/stack/stack.utils.ts";
import { Prompt } from "@effect/cli";
import { HttpClientRequest, HttpClientResponse } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { QuitException } from "@effect/platform/Terminal";
import { Config, Console, Effect, Option, Redacted, Schema } from "effect";

/** Read from the process environment by Effect, never logged in clear text. */
const tunnelTokenConfig: Config.Config<
  Option.Option<Redacted.Redacted<string>>
> = Config.option(Config.redacted(Secrets.tunnelTokenVariable));

/** Unattended runs export the token; interactive runs get a hidden prompt. */
const readTunnelToken = (): Effect.Effect<
  Redacted.Redacted<string>,
  EmptyTunnelTokenError | QuitException,
  Prompt.Prompt.Environment
> =>
  Effect.gen(function* () {
    const fromEnvironment: Option.Option<Redacted.Redacted<string>> =
      yield* Effect.orDie(tunnelTokenConfig);
    const token: Redacted.Redacted<string> = Option.isSome(fromEnvironment)
      ? fromEnvironment.value
      : yield* Prompt.run(
          Prompt.password({ message: Secrets.messages.tunnelTokenPrompt }),
        );
    const value: string = Redacted.value(token).trim();
    return value.length > 0
      ? Redacted.make(value)
      : yield* new EmptyTunnelTokenError({
          variable: Secrets.tunnelTokenVariable,
        });
  });

/** Local-only stacks never reach Cloudflare, so no token is asked for. */
const writeTunnelToken = (
  dependencies: StackDependencies,
  local: boolean,
): Effect.Effect<
  void,
  EmptyTunnelTokenError | PlatformError | QuitException,
  Prompt.Prompt.Environment
> =>
  local
    ? Console.log(Stack.messages.localMode)
    : Effect.flatMap(
        readTunnelToken(),
        (
          token: Redacted.Redacted<string>,
        ): Effect.Effect<void, PlatformError> =>
          dependencies.secrets.write(Secrets.files.tunnelToken, token),
      );

const reportInit = (
  dependencies: StackDependencies,
  backend: Backend,
  model: ResolvedModel,
  apiKey: Redacted.Redacted<string>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const modelPath: string = dependencies.path.join(
      model.directory,
      model.file,
    );
    yield* Console.log(Stack.messages.initialized(backend));
    yield* Console.log(Stack.messages.modelPath(modelPath));
    yield* Console.log(Stack.messages.secretsWritten);
    yield* Console.log(
      Stack.messages.fingerprint(dependencies.secrets.fingerprint(apiKey)),
    );
    yield* Console.log(Stack.messages.nextStep);
  });

const initialize = (
  dependencies: StackDependencies,
  input: InitInput,
): Effect.Effect<void, InitError, Prompt.Prompt.Environment> =>
  Effect.gen(function* () {
    yield* dependencies.backends.assertHost(input.backend);
    const home: string = yield* dependencies.host.homeDirectory;
    const source: ModelSource = yield* makeModelSource({
      include: input.include,
      modelFile: input.modelFile,
      modelUrl: input.modelUrl,
      repository: input.repository,
    });
    const model: ResolvedModel = yield* dependencies.models.resolve({
      directory: input.modelDirectory.pipe(
        Option.getOrElse((): string => defaultModelDirectory(home)),
      ),
      source,
    });
    const apiKey: Redacted.Redacted<string> =
      yield* dependencies.secrets.generateApiKey;
    yield* dependencies.secrets.write(Secrets.files.apiKey, apiKey);
    yield* writeTunnelToken(dependencies, input.local);
    yield* dependencies.env.write(
      makeStackEnv({
        backend: input.backend,
        model,
        threads: dependencies.host.threads,
      }),
    );
    yield* reportInit(dependencies, input.backend, model, apiKey);
  });

const reportPlatformHints = (
  dependencies: StackDependencies,
  backend: Backend,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Console.log(Stack.messages.preflightOk(backend));
    if (
      backend === HardwareBackends.nvidia &&
      dependencies.host.isPlatform(Host.platforms.windows)
    ) {
      yield* Console.log(Stack.messages.windowsNvidia);
    }
    if (
      backend === HardwareBackends.cpu &&
      dependencies.host.isPlatform(Host.platforms.macos)
    ) {
      yield* Console.log(Stack.messages.macosCpuOnly);
    }
  });

const preflight = (
  dependencies: StackDependencies,
  backend: Backend,
  local: boolean,
): Effect.Effect<void, PreflightError> =>
  Effect.gen(function* () {
    const location: ResolvedModel = yield* dependencies.env.requireModel;
    const modelPath: string = dependencies.path.resolve(
      location.directory,
      location.file,
    );
    if (!(yield* dependencies.fileSystem.exists(modelPath))) {
      return yield* new ModelFileMissingError({ path: modelPath });
    }
    yield* dependencies.secrets.assertPresent(
      local ? Secrets.localFiles : Secrets.edgeFiles,
    );
    yield* dependencies.backends.assertDevices(backend);
    yield* dependencies.docker.compose(backend, Docker.verbs.config, { local });
    yield* reportPlatformHints(dependencies, backend);
    if (local) yield* Console.log(Stack.messages.localMode);
  });

/** The answer must be an OpenAI chat completion, not merely an HTTP 200. */
const completionResponseSchema = Schema.Struct({
  choices: Schema.NonEmptyArray(
    Schema.Struct({ message: Schema.Struct({ content: Schema.String }) }),
  ),
});

type CompletionResponse = Schema.Schema.Type<typeof completionResponseSchema>;

/** Smoke test against the loopback port, no curl or PowerShell needed. */
const smokeTest = (
  dependencies: StackDependencies,
): Effect.Effect<void, SmokeTestError> =>
  Effect.gen(function* () {
    const apiKey: Redacted.Redacted<string> = yield* dependencies.secrets.read(
      Secrets.files.apiKey,
    );
    const values: StackEnv = yield* dependencies.env.read;
    const endpoint: string = Stack.local.endpoint(
      Option.getOrElse(values.localPort, (): string => Stack.local.defaultPort),
    );
    const request: HttpClientRequest.HttpClientRequest =
      yield* HttpClientRequest.post(endpoint).pipe(
        HttpClientRequest.bearerToken(apiKey),
        HttpClientRequest.bodyJson(
          makeCompletionRequest(
            Option.getOrElse(
              values.modelAlias,
              (): string => Stack.local.fallbackAlias,
            ),
          ),
        ),
      );
    const response: HttpClientResponse.HttpClientResponse =
      yield* dependencies.httpClient.execute(request);
    if (response.status >= Stack.local.errorStatus) {
      const body: string = yield* response.text;
      return yield* new LlamaRequestError({
        body: body.slice(0, Stack.local.snippetLength),
        status: response.status,
      });
    }
    const completion: CompletionResponse =
      yield* HttpClientResponse.schemaBodyJson(completionResponseSchema)(
        response,
      ).pipe(
        Effect.mapError(
          (cause: Error): LlamaResponseError =>
            new LlamaResponseError({
              endpoint,
              reason: cause.message.slice(0, Stack.local.snippetLength),
            }),
        ),
      );
    yield* Console.log(completion.choices[0].message.content);
  });

const rotateApiKey = (
  dependencies: StackDependencies,
): Effect.Effect<void, PlatformError> =>
  dependencies.secrets.rotateApiKey.pipe(
    Effect.flatMap((key) =>
      Console.log(Stack.messages.rotated).pipe(
        Effect.andThen(
          Console.log(
            Stack.messages.rotatedFingerprint(
              dependencies.secrets.fingerprint(key),
            ),
          ),
        ),
      ),
    ),
  );

export { initialize, preflight, rotateApiKey, smokeTest };
