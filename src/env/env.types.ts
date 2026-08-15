import { EnvFile } from "@app/env/env.constants.ts";
import { Data, type Option } from "effect";

/** Flat `KEY=value` map, exactly what Docker Compose reads from `.env`. */
type EnvRecord = Record<string, string>;

/** Everything the CLI reads back from `.env`, before `init` has necessarily run. */
interface StackEnv {
  readonly backend: Option.Option<string>;
  readonly localPort: Option.Option<string>;
  readonly modelAlias: Option.Option<string>;
  readonly modelDirectory: Option.Option<string>;
  readonly modelFile: Option.Option<string>;
}

/** The subset `preflight` and Compose cannot work without. */
interface ModelLocation {
  readonly directory: string;
  readonly file: string;
}

class EnvNotInitializedError extends Data.TaggedError(
  "EnvNotInitializedError",
)<{
  readonly missing: string;
}> {
  override get message(): string {
    return EnvFile.messages.notInitialized(this.missing);
  }
}

export {
  EnvNotInitializedError,
  type EnvRecord,
  type ModelLocation,
  type StackEnv,
};
