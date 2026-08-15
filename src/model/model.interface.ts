import type {
  HuggingFaceCliMissingError,
  ModelDownloadError,
  ModelFileMissingError,
  ModelNotFoundError,
  ModelRequest,
  ResolvedModel,
} from "@app/model/model.types.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import type { Effect } from "effect";

type ModelResolutionError =
  | CommandFailedError
  | HuggingFaceCliMissingError
  | ModelDownloadError
  | ModelFileMissingError
  | ModelNotFoundError
  | PlatformError;

interface ModelApi {
  /** Resolves any source — local path, download link or Hugging Face repository. */
  readonly resolve: (
    request: ModelRequest,
  ) => Effect.Effect<ResolvedModel, ModelResolutionError>;
}

export type { ModelApi, ModelResolutionError };
