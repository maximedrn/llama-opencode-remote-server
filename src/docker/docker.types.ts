import { Data } from "effect";

interface ComposeOptions {
  /** Adds the override publishing 127.0.0.1:8080. */
  readonly local?: boolean;
}

class DockerUnavailableError extends Data.TaggedError(
  "DockerUnavailableError",
)<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

export { type ComposeOptions, DockerUnavailableError };
