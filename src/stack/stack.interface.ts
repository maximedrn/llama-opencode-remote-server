import type { BackendApi } from "@app/backend/backend.interface.ts";
import type {
  Backend,
  IncompatibleHostError,
  UnsupportedBackendError,
} from "@app/backend/backend.types.ts";
import type { DockerApi } from "@app/docker/docker.interface.ts";
import type { EnvApi } from "@app/env/env.interface.ts";
import type { EnvNotInitializedError } from "@app/env/env.types.ts";
import type { HostApi } from "@app/host/host.interface.ts";
import type {
  ModelApi,
  ModelResolutionError,
} from "@app/model/model.interface.ts";
import type {
  ModelFileMissingError,
  ModelSourceError,
} from "@app/model/model.types.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import type { SecretApi } from "@app/secret/secret.interface.ts";
import type {
  EmptyTunnelTokenError,
  MissingSecretError,
} from "@app/secret/secret.types.ts";
import type {
  InitInput,
  LlamaRequestError,
  LlamaResponseError,
  MissingClientConfigError,
} from "@app/stack/stack.types.ts";
import type { Prompt } from "@effect/cli";
import type {
  FileSystem,
  HttpClient,
  HttpClientError,
  Path,
} from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { QuitException } from "@effect/platform/Terminal";
import type { Effect, Option } from "effect";

interface StackDependencies {
  readonly backends: BackendApi;
  readonly docker: DockerApi;
  readonly env: EnvApi;
  readonly fileSystem: FileSystem.FileSystem;
  readonly host: HostApi;
  readonly httpClient: HttpClient.HttpClient;
  readonly models: ModelApi;
  readonly path: Path.Path;
  readonly secrets: SecretApi;
}

type BackendResolutionError =
  | IncompatibleHostError
  | PlatformError
  | UnsupportedBackendError;

type InitError =
  | EmptyTunnelTokenError
  | ModelSourceError
  | IncompatibleHostError
  | ModelResolutionError
  | PlatformError
  | QuitException;

type PreflightError =
  | ModelFileMissingError
  | CommandFailedError
  | EnvNotInitializedError
  | IncompatibleHostError
  | MissingSecretError
  | ModelFileMissingError
  | PlatformError;

type SmokeTestError =
  | HttpClientError.HttpClientError
  | LlamaRequestError
  | LlamaResponseError
  | MissingClientConfigError
  | PlatformError;

interface StackApi {
  readonly init: (
    input: InitInput,
  ) => Effect.Effect<void, InitError, Prompt.Prompt.Environment>;
  readonly preflight: (
    backend: Backend,
    local: boolean,
  ) => Effect.Effect<void, PreflightError>;
  /** `--backend` wins, then the backend remembered in `.env`, then cpu. */
  readonly resolveBackend: (
    requested: Option.Option<Backend>,
  ) => Effect.Effect<Backend, BackendResolutionError>;
  readonly rotateKey: Effect.Effect<void, PlatformError>;
  /** Calls whatever `clients/client.env` points at, as a client would. */
  readonly test: Effect.Effect<void, SmokeTestError>;
}

export type {
  BackendResolutionError,
  InitError,
  PreflightError,
  SmokeTestError,
  StackApi,
  StackDependencies,
};
