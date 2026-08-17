import type {
  LlamaAuthError,
  LlamaRequestError,
  LlamaResponseError,
  LlamaUnreachableError,
  MissingClientConfigError,
} from "@app/cli/operation/client/client.types.ts";
import type { EnvApi } from "@app/cli/resource/env/env.interface.ts";
import type { EnvReadError } from "@app/cli/resource/env/env.types.ts";
import type { HttpClient } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";

/** All a client-side call needs: the two env files and an HTTP client. */
interface ClientDependencies {
  readonly env: EnvApi;
  readonly httpClient: HttpClient.HttpClient;
}

/** "Nothing answered", "the key was refused" and "the server complained"
 * stay three separate diagnoses instead of one opaque HTTP error. */
type ClientCallError =
  | LlamaAuthError
  | LlamaRequestError
  | LlamaUnreachableError;

type SmokeTestError =
  | ClientCallError
  | EnvReadError
  | LlamaResponseError
  | MissingClientConfigError
  | PlatformError;

export type { ClientCallError, ClientDependencies, SmokeTestError };
