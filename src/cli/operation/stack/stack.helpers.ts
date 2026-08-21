import { servedModels } from "@app/cli/operation/client/client.helpers.ts";
import { Stack } from "@app/cli/operation/stack/stack.constants.ts";
import type {
  InitError,
  ListModelsError,
  PreflightError,
  StackDependencies,
} from "@app/cli/operation/stack/stack.interface.ts";
import type { InitInput } from "@app/cli/operation/stack/stack.types.ts";
import { InitAbortedError } from "@app/cli/operation/stack/stack.types.ts";
import { HardwareBackends } from "@app/cli/resource/backend/backend.constants.ts";
import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import { Docker } from "@app/cli/resource/docker/docker.constants.ts";
import type { ComposeOptions } from "@app/cli/resource/docker/docker.types.ts";
import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import { makeStackEnv } from "@app/cli/resource/env/env.factory.ts";
import type { ModelLocation } from "@app/cli/resource/env/env.types.ts";
import { makeModelSource } from "@app/cli/resource/model/model.factory.ts";
import { listLocalModels } from "@app/cli/resource/model/model.helpers.ts";
import type {
  ModelListing,
  ModelSource,
  ResolvedModel,
} from "@app/cli/resource/model/model.types.ts";
import { ModelFileMissingError } from "@app/cli/resource/model/model.types.ts";
import { defaultModelDirectory } from "@app/cli/resource/model/model.utils.ts";
import { Secrets } from "@app/cli/resource/secret/secret.constants.ts";
import { EmptyTunnelTokenError } from "@app/cli/resource/secret/secret.types.ts";
import { Host } from "@app/cli/system/host/host.constants.ts";
import { Prompt } from "@effect/cli";
import type { PlatformError } from "@effect/platform/Error";
import type { QuitException } from "@effect/platform/Terminal";
import { Config, Console, Effect, Option, Redacted } from "effect";

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
      yield* Effect.orElseSucceed(
        tunnelTokenConfig,
        (): Option.Option<Redacted.Redacted<string>> => Option.none(),
      );
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

/** Everything a second `init` would replace on this machine. */
const overwritePaths = (
  dependencies: StackDependencies,
  local: boolean,
): readonly string[] => [
  dependencies.path.join(Secrets.directory, Secrets.files.apiKey),
  ...(local
    ? []
    : [dependencies.path.join(Secrets.directory, Secrets.files.tunnelToken)]),
  EnvFile.path,
];

/**
 * Asked before the model is resolved, so an aborted `init` has not downloaded
 * gigabytes first. A key nobody wrote down cannot be recovered, hence the
 * default answer: keep what is already there.
 */
const confirmOverwrite = (
  dependencies: StackDependencies,
  input: InitInput,
): Effect.Effect<
  void,
  InitAbortedError | PlatformError | QuitException,
  Prompt.Prompt.Environment
> =>
  Effect.gen(function* () {
    if (input.force) return;
    const existing: readonly string[] = yield* Effect.filter(
      overwritePaths(dependencies, input.local),
      (path: string): Effect.Effect<boolean, PlatformError> =>
        dependencies.fileSystem.exists(path),
    );
    if (existing.length === 0) return;
    const overwrite: boolean = yield* Prompt.run(
      Prompt.confirm({
        initial: false,
        message: Stack.messages.alreadyInitialized(existing),
      }),
    );
    if (!overwrite) return yield* new InitAbortedError({ paths: existing });
  });

const reportInit = (
  dependencies: StackDependencies,
  input: InitInput,
  model: ResolvedModel,
  apiKey: Redacted.Redacted<string>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Console.log(Stack.messages.initialized(input.backend));
    yield* Console.log(
      Stack.messages.modelPath(
        dependencies.path.join(model.directory, model.file),
      ),
    );
    yield* Console.log(Stack.messages.secretsWritten);
    yield* Console.log(
      Stack.messages.fingerprint(dependencies.secrets.fingerprint(apiKey)),
    );
    if (input.keepalive) yield* Console.log(Stack.messages.keepaliveMode);
    yield* Console.log(Stack.messages.nextStep);
  });

const initialize = (
  dependencies: StackDependencies,
  input: InitInput,
): Effect.Effect<void, InitError, Prompt.Prompt.Environment> =>
  Effect.gen(function* () {
    yield* dependencies.backends.assertHost(input.backend);
    yield* confirmOverwrite(dependencies, input);
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
        existing: yield* dependencies.env.readRaw,
        keepalive: input.keepalive,
        model,
        threads: dependencies.host.threads,
      }),
    );
    yield* reportInit(dependencies, input, model, apiKey);
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
  options: ComposeOptions,
): Effect.Effect<void, PreflightError> =>
  Effect.gen(function* () {
    const location: ModelLocation = yield* dependencies.env.requireModel;
    const modelPath: string = dependencies.path.resolve(
      location.directory,
      location.file,
    );
    if (!(yield* dependencies.fileSystem.exists(modelPath))) {
      return yield* new ModelFileMissingError({ path: modelPath });
    }
    // A local-only stack still needs the API key, but never the tunnel token.
    yield* dependencies.secrets.assertPresent(
      options.local === true
        ? [Secrets.files.apiKey]
        : [Secrets.files.apiKey, Secrets.files.tunnelToken],
    );
    yield* dependencies.backends.assertDevices(backend);
    yield* dependencies.docker.compose(backend, Docker.verbs.config, options);
    yield* reportPlatformHints(dependencies, backend);
    if (options.keepalive === true) {
      yield* Console.log(Stack.messages.keepaliveMode);
    }
    if (options.local === true) yield* Console.log(Stack.messages.localMode);
  });

/**
 * A server host lists the files it can mount; a client host has none of them,
 * so it falls back to whatever the endpoint in `client.env` says it serves.
 */
const listModels = (
  dependencies: StackDependencies,
): Effect.Effect<readonly ModelListing[], ListModelsError> =>
  dependencies.env.requireModel.pipe(
    Effect.flatMap(
      (location: ModelLocation): Effect.Effect<readonly ModelListing[]> =>
        listLocalModels(dependencies, location.directory),
    ),
    Effect.flatMap(
      (
        models: readonly ModelListing[],
      ): Effect.Effect<readonly ModelListing[], ListModelsError> =>
        models.length > 0 ? Effect.succeed(models) : servedModels(dependencies),
    ),
    Effect.catchTag(
      "EnvNotInitializedError",
      (): Effect.Effect<readonly ModelListing[], ListModelsError> =>
        servedModels(dependencies),
    ),
  );

export { initialize, listModels, overwritePaths, preflight };
