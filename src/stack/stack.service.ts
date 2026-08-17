import { BackendService } from "@app/backend/backend.service.ts";
import type { Backend } from "@app/backend/backend.types.ts";
import { DockerService } from "@app/docker/docker.service.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import { EnvService } from "@app/env/env.service.ts";
import type { EnvReadError } from "@app/env/env.types.ts";
import { HostService } from "@app/host/host.service.ts";
import { ModelService } from "@app/model/model.service.ts";
import { SecretService } from "@app/secret/secret.service.ts";
import { health, smokeTest } from "@app/stack/client.ts";
import { doctor } from "@app/stack/doctor.ts";
import { listModels } from "@app/stack/models.ts";
import { resolveBackend, resolveComposeOptions } from "@app/stack/resolve.ts";
import { rotateApiKey } from "@app/stack/rotate.ts";
import { initialize, preflight } from "@app/stack/stack.helpers.ts";
import type {
  BackendResolutionError,
  InitError,
  PreflightError,
  RotateKeyError,
  StackApi,
  StackDependencies,
  UninstallError,
} from "@app/stack/stack.interface.ts";
import type { DoctorResult, InitInput } from "@app/stack/stack.types.ts";
import { uninstall } from "@app/stack/uninstall.ts";
import type { Prompt } from "@effect/cli";
import { FileSystem, HttpClient, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
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

    const api: StackApi = {
      composeOptions: (
        local: boolean,
        overrideFile: Option.Option<string>,
      ): Effect.Effect<ComposeOptions, EnvReadError | PlatformError> =>
        resolveComposeOptions(dependencies, local, overrideFile),
      doctor: (
        backend: Backend,
        options: ComposeOptions,
        client: boolean,
      ): Effect.Effect<readonly DoctorResult[]> =>
        doctor(dependencies, backend, options, client),
      health: health(dependencies),
      init: (
        input: InitInput,
      ): Effect.Effect<void, InitError, Prompt.Prompt.Environment> =>
        initialize(dependencies, input),
      models: listModels(dependencies),
      preflight: (
        backend: Backend,
        options: ComposeOptions,
      ): Effect.Effect<void, PreflightError> =>
        preflight(dependencies, backend, options),
      resolveBackend: (
        requested: Option.Option<Backend>,
      ): Effect.Effect<Backend, BackendResolutionError> =>
        resolveBackend(dependencies, requested),
      rotateKey: (
        backend: Backend,
        options: ComposeOptions,
      ): Effect.Effect<void, RotateKeyError> =>
        rotateApiKey(dependencies, backend, options),
      test: smokeTest(dependencies),
      uninstall: (
        backend: Backend,
        options: ComposeOptions,
      ): Effect.Effect<void, UninstallError, Prompt.Prompt.Environment> =>
        uninstall(dependencies, backend, options),
    };
    return api;
  }),
}) {}

export { StackService };
