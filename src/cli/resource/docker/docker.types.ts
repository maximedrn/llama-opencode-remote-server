import { Data } from "effect";

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

/** One container, as `docker compose ps --format json` describes it. */
interface ComposeStatusEntry {
  readonly health: string;
  readonly service: string;
  readonly state: string;
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

export { type ComposeOptions, type ComposeStatusEntry, DockerUnavailableError };
