import { Model } from "@app/cli/resource/model/model.constants.ts";
import type { ProcessApi } from "@app/cli/system/process/process.interface.ts";
import type { FileSystem, Path } from "@effect/platform";
import { Data, type Option } from "effect";

interface ResolvedModel {
  /** Host directory bind-mounted read-only at `/models`. */
  readonly directory: string;
  /** Model path relative to `directory`. */
  readonly file: string;
}

/** A model already on disk, given as an absolute or relative path. */
interface LocalFileSource {
  readonly kind: "LocalFile";
  readonly path: string;
}

/** A direct download link, saved under the model directory. */
interface DownloadUrlSource {
  readonly kind: "DownloadUrl";
  readonly url: string;
}

/** A Hugging Face repository, fetched with the `hf` CLI. */
interface HuggingFaceSource {
  /** Glob passed to `--include`, e.g. `*Q5_K_M*.gguf`. */
  readonly include: string;
  readonly kind: "HuggingFace";
  readonly repository: string;
}

type ModelSource = DownloadUrlSource | HuggingFaceSource | LocalFileSource;

/** One model the CLI can name: a local file, or an alias the server serves. */
interface ModelListing {
  readonly name: string;
  /** Bytes on disk; `None` for a model only the server knows about. */
  readonly size: Option.Option<number>;
}

interface ModelRequest {
  readonly directory: string;
  readonly source: ModelSource;
}

interface ModelDependencies {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly processes: ProcessApi;
}

interface ListDependencies {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}

interface ModelSourceInput {
  /** Glob passed to `hf download --include`. */
  readonly include: Option.Option<string>;
  readonly modelFile: Option.Option<string>;
  readonly modelUrl: Option.Option<string>;
  readonly repository: Option.Option<string>;
}

class HuggingFaceCliMissingError extends Data.TaggedError(
  "HuggingFaceCliMissingError",
)<{ readonly repository: string }> {
  override get message(): string {
    return Model.messages.cliMissing;
  }
}

class ModelNotFoundError extends Data.TaggedError("ModelNotFoundError")<{
  readonly directory: string;
  readonly pattern: string;
}> {
  override get message(): string {
    return Model.messages.notFound(this.directory, this.pattern);
  }
}

class ModelFileMissingError extends Data.TaggedError("ModelFileMissingError")<{
  readonly path: string;
}> {
  override get message(): string {
    return Model.messages.fileMissing(this.path);
  }
}

class ModelDownloadError extends Data.TaggedError("ModelDownloadError")<{
  readonly reason: string;
  readonly url: string;
}> {
  override get message(): string {
    return Model.messages.downloadFailed(this.url, this.reason);
  }
}

class ModelSourceError extends Data.TaggedError("ModelSourceError")<{
  readonly given: number;
}> {
  override get message(): string {
    return Model.messages.sourceRequired;
  }
}

export {
  type DownloadUrlSource,
  HuggingFaceCliMissingError,
  type HuggingFaceSource,
  type ListDependencies,
  type LocalFileSource,
  type ModelDependencies,
  ModelDownloadError,
  ModelFileMissingError,
  type ModelListing,
  ModelNotFoundError,
  type ModelRequest,
  type ModelSource,
  ModelSourceError,
  type ModelSourceInput,
  type ResolvedModel,
};
