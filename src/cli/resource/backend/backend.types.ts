import { Backends } from "@app/cli/resource/backend/backend.constants.ts";
import { Data } from "effect";

type Backend = (typeof Backends.list)[number];

class UnsupportedBackendError extends Data.TaggedError(
  "UnsupportedBackendError",
)<{ readonly backend: string }> {
  override get message(): string {
    return Backends.messages.unsupported(this.backend);
  }
}

class IncompatibleHostError extends Data.TaggedError("IncompatibleHostError")<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

export { type Backend, IncompatibleHostError, UnsupportedBackendError };
