import { Data, Schema } from "effect";

interface ComposeOptions {
  /** Adds the keep-alive front between the proxy and llama.cpp. */
  readonly keepalive?: boolean;
  /**
   * Replaces `docker/docker-compose.<backend>.yaml`, the file that defines
   * llama.cpp. The base file (proxy, tunnel, secrets, networks) always stays.
   */
  readonly llamaFile?: string;
  /** Adds the override publishing the stack on the loopback interface. */
  readonly local?: boolean;
}

/**
 * One container as `docker compose ps --format json` describes it. The wire
 * names are Compose's, and a container without a healthcheck simply omits the
 * field, hence the defaults.
 */
const composeStatusSchema = Schema.Struct({
  Health: Schema.optionalWith(Schema.String, { default: (): string => "" }),
  Service: Schema.String,
  State: Schema.optionalWith(Schema.String, { default: (): string => "" }),
});

interface ComposeStatusEntry {
  readonly health: string;
  readonly service: string;
  readonly state: string;
}

type ComposeStatusFields = Schema.Schema.Type<typeof composeStatusSchema>;

class DockerUnavailableError extends Data.TaggedError(
  "DockerUnavailableError",
)<{
  readonly reason: string;
}> {
  override get message(): string {
    return this.reason;
  }
}

export {
  type ComposeOptions,
  type ComposeStatusEntry,
  type ComposeStatusFields,
  composeStatusSchema,
  DockerUnavailableError,
};
