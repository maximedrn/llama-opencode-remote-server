import type { Backend } from "@app/backend/backend.types.ts";
import { ClientFile } from "@app/env/env.constants.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type { Option } from "effect";
import { Data } from "effect";

interface InitInput {
  readonly backend: Backend;
  /** Skips the confirmation guarding an existing `.env` and `secrets/`. */
  readonly force: boolean;
  /** Glob passed to `hf download --include`. */
  readonly include: Option.Option<string>;
  /** Local-only stack: no Cloudflare Tunnel token is needed. */
  readonly local: boolean;
  readonly modelDirectory: Option.Option<string>;
  readonly modelFile: Option.Option<string>;
  readonly modelUrl: Option.Option<string>;
  readonly repository: Option.Option<string>;
}

/** One model the CLI can name: a local file, or an alias the server serves. */
interface ModelListing {
  readonly name: string;
  /** Bytes on disk; `None` for a model only the server knows about. */
  readonly size: Option.Option<number>;
}

/** One line of `stack doctor`, failures carrying the fix that clears them. */
interface DoctorResult {
  readonly detail: Option.Option<string>;
  readonly fix: Option.Option<string>;
  readonly label: string;
  readonly ok: boolean;
}

class LlamaRequestError extends Data.TaggedError("LlamaRequestError")<{
  readonly body: string;
  readonly status: number;
}> {
  override get message(): string {
    return Stack.messages.requestFailed(this.status, this.body);
  }
}

class LlamaResponseError extends Data.TaggedError("LlamaResponseError")<{
  readonly endpoint: string;
  readonly reason: string;
}> {
  override get message(): string {
    return Stack.messages.notLlamaServer(this.endpoint, this.reason);
  }
}

/** The endpoint answered, but refused the credentials it was given. */
class LlamaAuthError extends Data.TaggedError("LlamaAuthError")<{
  readonly endpoint: string;
}> {
  override get message(): string {
    return Stack.messages.llamaAuth(this.endpoint);
  }
}

/** Nothing answered at all: the stack is down, or the URL points elsewhere. */
class LlamaUnreachableError extends Data.TaggedError("LlamaUnreachableError")<{
  readonly endpoint: string;
  readonly reason: string;
}> {
  override get message(): string {
    return Stack.messages.llamaUnreachable(this.endpoint, this.reason);
  }
}

/** The restarted container never reported healthy within the poll window. */
class LlamaNotHealthyError extends Data.TaggedError("LlamaNotHealthyError")<{
  readonly backend: Backend;
}> {
  override get message(): string {
    return Stack.messages.llamaNotHealthy(this.backend);
  }
}

/** `init` found files it would replace and the operator declined. */
class InitAbortedError extends Data.TaggedError("InitAbortedError")<{
  readonly paths: readonly string[];
}> {
  override get message(): string {
    return Stack.messages.aborted(this.paths);
  }
}

/** Non-zero exit for `doctor`, so a script can gate on its verdict. */
class DoctorFailedError extends Data.TaggedError("DoctorFailedError")<{
  readonly failures: readonly string[];
}> {
  override get message(): string {
    return Stack.messages.needsAttention(this.failures);
  }
}

/** `client.env` is filled in by hand, so `init` cannot vouch for it. */
class MissingClientConfigError extends Data.TaggedError(
  "MissingClientConfigError",
)<{
  readonly variable: string;
}> {
  override get message(): string {
    return ClientFile.messages.missing(this.variable);
  }
}

export {
  DoctorFailedError,
  type DoctorResult,
  InitAbortedError,
  type InitInput,
  LlamaAuthError,
  LlamaNotHealthyError,
  LlamaRequestError,
  LlamaResponseError,
  LlamaUnreachableError,
  MissingClientConfigError,
  type ModelListing,
};
