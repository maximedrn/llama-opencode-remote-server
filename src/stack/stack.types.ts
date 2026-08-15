import type { Backend } from "@app/backend/backend.types.ts";
import { ClientFile } from "@app/env/env.constants.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type { Option } from "effect";
import { Data } from "effect";

interface InitInput {
  readonly backend: Backend;
  /** Glob passed to `hf download --include`. */
  readonly include: Option.Option<string>;
  /** Local-only stack: no Cloudflare Tunnel token is needed. */
  readonly local: boolean;
  readonly modelDirectory: Option.Option<string>;
  readonly modelFile: Option.Option<string>;
  readonly modelUrl: Option.Option<string>;
  readonly repository: Option.Option<string>;
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
  type InitInput,
  LlamaRequestError,
  LlamaResponseError,
  MissingClientConfigError,
};
