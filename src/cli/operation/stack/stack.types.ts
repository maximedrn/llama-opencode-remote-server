import { Stack } from "@app/cli/operation/stack/stack.constants.ts";
import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import type { Option } from "effect";
import { Data } from "effect";

interface InitInput {
  readonly backend: Option.Option<Backend>;
  /** Skips the confirmation guarding existing secrets. */
  readonly force: boolean;
  /** Glob passed to `hf download --include`. */
  readonly include: Option.Option<string>;
  readonly keepalive: Option.Option<boolean>;
  /** Local-only stack: no Cloudflare Tunnel token is needed. */
  readonly local: boolean;
  readonly modelDirectory: Option.Option<string>;
  readonly modelFile: Option.Option<string>;
  readonly modelUrl: Option.Option<string>;
  readonly repository: Option.Option<string>;
}

/** `init` found files it would replace and the operator declined. */
class InitAbortedError extends Data.TaggedError("InitAbortedError")<{
  readonly paths: readonly string[];
}> {
  override get message(): string {
    return Stack.messages.aborted(this.paths);
  }
}

class InitModelMismatchError extends Data.TaggedError(
  "InitModelMismatchError",
)<{
  readonly configured: string;
  readonly resolved: string;
}> {
  override get message(): string {
    return `Resolved ${this.resolved}, but .env selects ${this.configured}. Update MODEL_DIRECTORY and MODEL_FILE in .env or select the configured model.`;
  }
}

export { InitAbortedError, type InitInput, InitModelMismatchError };
