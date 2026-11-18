import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import { Data, type Option } from "effect";

/** Flat `KEY=value` map, exactly what Docker Compose reads from `.env`. */
type EnvRecord = Record<string, string>;

/** Everything the CLI reads back from `.env`, before `init` has necessarily run. */
interface StackEnv {
  readonly backend: Option.Option<string>;
  /** Extra Compose file every command layers on top of the shipped ones. */
  readonly composeFile: Option.Option<string>;
  /** Set when the keep-alive front is part of this deployment. */
  readonly keepalive: Option.Option<string>;
  readonly localPort: Option.Option<string>;
  readonly modelAlias: Option.Option<string>;
  readonly modelDirectory: Option.Option<string>;
  readonly modelFile: Option.Option<string>;
}

/** What `clients/client.env` holds; the Access pair stays empty locally. */
interface ClientEnv {
  readonly accessClientId: Option.Option<string>;
  readonly accessClientSecret: Option.Option<string>;
  readonly apiKey: Option.Option<string>;
  readonly baseUrl: Option.Option<string>;
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

/** A malformed `.env` is a user error, not a defect: it is reported, not thrown. */
class EnvReadError extends Data.TaggedError("EnvReadError")<{
  readonly file: string;
  readonly reason: string;
}> {
  override get message(): string {
    return EnvFile.messages.readFailed(this.file, this.reason);
  }
}

export {
  type ClientEnv,
  EnvNotInitializedError,
  EnvReadError,
  type EnvRecord,
  type ModelLocation,
  type StackEnv,
};
