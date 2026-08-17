import { BackendService } from "@app/cli/backend/backend.service.ts";
import type { Backend } from "@app/cli/backend/backend.types.ts";
import { health, smokeTest } from "@app/cli/client/client.helpers.ts";
import { DockerService } from "@app/cli/docker/docker.service.ts";
import type { ComposeOptions } from "@app/cli/docker/docker.types.ts";
import { doctor } from "@app/cli/doctor/doctor.helpers.ts";
import type { DoctorResult } from "@app/cli/doctor/doctor.types.ts";
import { EnvService } from "@app/cli/env/env.service.ts";
import type { EnvReadError } from "@app/cli/env/env.types.ts";
import { HostService } from "@app/cli/host/host.service.ts";
import {
  rotateApiKey,
  uninstall,
} from "@app/cli/lifecycle/lifecycle.helpers.ts";
import type {
  RotateKeyError,
  UninstallError,
} from "@app/cli/lifecycle/lifecycle.types.ts";
import { ModelService } from "@app/cli/model/model.service.ts";
import { SecretService } from "@app/cli/secret/secret.service.ts";
import {
  makeComposeOptions,
  resolveBackend,
} from "@app/cli/stack/stack.factory.ts";
import {
  initialize,
  listModels,
  preflight,
} from "@app/cli/stack/stack.helpers.ts";
import type {
  BackendResolutionError,
  InitError,
  PreflightError,
  StackApi,
  StackDependencies,
} from "@app/cli/stack/stack.interface.ts";
import type { InitInput } from "@app/cli/stack/stack.types.ts";
import type { Prompt } from "@effect/cli";
import { FileSystem, HttpClient, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, type Option } from "effect";

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
        keepalive: Option.Option<boolean>,
        llamaFile: Option.Option<string>,
      ): Effect.Effect<ComposeOptions, EnvReadError | PlatformError> =>
        makeComposeOptions(dependencies, local, keepalive, llamaFile),
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
