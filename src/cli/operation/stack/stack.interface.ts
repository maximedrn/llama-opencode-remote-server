import type { SmokeTestError } from "@app/cli/operation/client/client.interface.ts";
import type { DoctorResult } from "@app/cli/operation/doctor/doctor.types.ts";
import type {
  RotateKeyError,
  UninstallError,
} from "@app/cli/operation/lifecycle/lifecycle.types.ts";
import type {
  InitAbortedError,
  InitInput,
} from "@app/cli/operation/stack/stack.types.ts";
import type { BackendApi } from "@app/cli/resource/backend/backend.interface.ts";
import type {
  Backend,
  IncompatibleHostError,
  UnsupportedBackendError,
} from "@app/cli/resource/backend/backend.types.ts";
import type { DockerApi } from "@app/cli/resource/docker/docker.interface.ts";
import type {
  ComposeOptions,
  DockerUnavailableError,
} from "@app/cli/resource/docker/docker.types.ts";
import type { EnvApi } from "@app/cli/resource/env/env.interface.ts";
import type {
  EnvNotInitializedError,
  EnvReadError,
} from "@app/cli/resource/env/env.types.ts";
import type {
  ModelApi,
  ModelResolutionError,
} from "@app/cli/resource/model/model.interface.ts";
import type {
  ModelFileMissingError,
  ModelListing,
  ModelSourceError,
} from "@app/cli/resource/model/model.types.ts";
import type { SecretApi } from "@app/cli/resource/secret/secret.interface.ts";
import type {
  EmptyTunnelTokenError,
  MissingSecretError,
} from "@app/cli/resource/secret/secret.types.ts";
import type { HostApi } from "@app/cli/system/host/host.interface.ts";
import type { CommandFailedError } from "@app/cli/system/process/process.types.ts";
import type { Prompt } from "@effect/cli";
import type { FileSystem, HttpClient, Path } from "@effect/platform";
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
  | EnvReadError
  | IncompatibleHostError
  | PlatformError
  | UnsupportedBackendError;

type InitError =
  | EmptyTunnelTokenError
  | IncompatibleHostError
  | InitAbortedError
  | ModelResolutionError
  | ModelSourceError
  | PlatformError
  | QuitException;

type PreflightError =
  | CommandFailedError
  | EnvNotInitializedError
  | EnvReadError
  | IncompatibleHostError
  | MissingSecretError
  | ModelFileMissingError
  | PlatformError;

type ListModelsError = EnvNotInitializedError | SmokeTestError;

/** Every failure a Compose-driving command can report. */
type LifecycleError =
  | BackendResolutionError
  | CommandFailedError
  | DockerUnavailableError
  | EnvReadError
  | PlatformError;

interface StackApi {
  /** Resolves the Compose layering: llama file, keep-alive front, `--local`. */
  readonly composeOptions: (
    local: boolean,
    keepalive: Option.Option<boolean>,
    llamaFile: Option.Option<string>,
  ) => Effect.Effect<ComposeOptions, EnvReadError | PlatformError>;
  /** Runs every check the stack needs, reporting one line per check. */
  readonly doctor: (
    backend: Backend,
    options: ComposeOptions,
    client: boolean,
  ) => Effect.Effect<readonly DoctorResult[]>;
  /** Cheap liveness probe: does the server answer, and is the key accepted? */
  readonly health: Effect.Effect<void, SmokeTestError>;
  readonly init: (
    input: InitInput,
  ) => Effect.Effect<void, InitError, Prompt.Prompt.Environment>;
  /** Local `.gguf` files, or what the server serves on a client host. */
  readonly models: Effect.Effect<readonly ModelListing[], ListModelsError>;
  readonly preflight: (
    backend: Backend,
    options: ComposeOptions,
  ) => Effect.Effect<void, PreflightError>;
  /** `--backend` wins, then the backend remembered in `.env`, then cpu. */
  readonly resolveBackend: (
    requested: Option.Option<Backend>,
  ) => Effect.Effect<Backend, BackendResolutionError>;
  /** Writes a new key, restarts llama.cpp, then waits for it to be healthy. */
  readonly rotateKey: (
    backend: Backend,
    options: ComposeOptions,
  ) => Effect.Effect<void, RotateKeyError>;
  /** Calls whatever `clients/client.env` points at, as a client would. */
  readonly test: Effect.Effect<void, SmokeTestError>;
  /** Stops every service, then offers to remove `.env` and `secrets/`. */
  readonly uninstall: (
    backend: Backend,
    options: ComposeOptions,
  ) => Effect.Effect<void, UninstallError, Prompt.Prompt.Environment>;
}

export type {
  BackendResolutionError,
  InitError,
  LifecycleError,
  ListModelsError,
  PreflightError,
  StackApi,
  StackDependencies,
};
