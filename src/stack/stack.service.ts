import { Backends } from "@app/backend/backend.constants.ts";
import { BackendService } from "@app/backend/backend.service.ts";
import type {
  Backend,
  UnsupportedBackendError,
} from "@app/backend/backend.types.ts";
import { DockerService } from "@app/docker/docker.service.ts";
import { EnvService } from "@app/env/env.service.ts";
import type { StackEnv } from "@app/env/env.types.ts";
import { HostService } from "@app/host/host.service.ts";
import { ModelService } from "@app/model/model.service.ts";
import { SecretService } from "@app/secret/secret.service.ts";
import {
  initialize,
  preflight,
  rotateApiKey,
  smokeTest,
} from "@app/stack/stack.helpers.ts";
import type {
  BackendResolutionError,
  InitError,
  PreflightError,
  StackApi,
  StackDependencies,
} from "@app/stack/stack.interface.ts";
import type { InitInput } from "@app/stack/stack.types.ts";
import type { Prompt } from "@effect/cli";
import { FileSystem, HttpClient, Path } from "@effect/platform";
import { Effect, Option } from "effect";

class StackService extends Effect.Service<StackService>()("StackService", {
  dependencies: [
    BackendService.Default,
    HostService.Default,
    DockerService.Default,
    EnvService.Default,
    ModelService.Default,
    SecretService.Default,
  ],
  effect: Effect.gen(function* () {
    const dependencies: StackDependencies = {
      backends: yield* BackendService,
      docker: yield* DockerService,
      env: yield* EnvService,
      fileSystem: yield* FileSystem.FileSystem,
      host: yield* HostService,
      httpClient: yield* HttpClient.HttpClient,
      models: yield* ModelService,
      path: yield* Path.Path,
      secrets: yield* SecretService,
    };

    const backendFromEnv: Effect.Effect<Backend, BackendResolutionError> =
      dependencies.env.read.pipe(
        Effect.flatMap(
          (env: StackEnv): Effect.Effect<Backend, UnsupportedBackendError> =>
            dependencies.backends.parse(
              Option.getOrElse(env.backend, (): string => Backends.fallback),
            ),
        ),
      );

    const resolveBackend = (
      requested: Option.Option<Backend>,
    ): Effect.Effect<Backend, BackendResolutionError> =>
      Option.match(requested, {
        onNone: (): Effect.Effect<Backend, BackendResolutionError> =>
          backendFromEnv,
        onSome: (backend: Backend): Effect.Effect<Backend> =>
          Effect.succeed(backend),
      }).pipe(Effect.tap(dependencies.backends.assertHost));

    const api: StackApi = {
      init: (
        input: InitInput,
      ): Effect.Effect<void, InitError, Prompt.Prompt.Environment> =>
        initialize(dependencies, input),
      preflight: (
        backend: Backend,
        local: boolean,
      ): Effect.Effect<void, PreflightError> =>
        preflight(dependencies, backend, local),
      resolveBackend,
      rotateKey: rotateApiKey(dependencies),
      test: smokeTest(dependencies),
    };
    return api;
  }),
}) {}

export { StackService };
