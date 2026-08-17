import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { Data, type Option } from "effect";

/** Everything the container is configured with, resolved once at startup. */
interface HeartbeatConfig {
  /** Bearer token read from the mounted Docker secret, when there is one. */
  readonly apiKey: Option.Option<string>;
  readonly healthUrl: string;
  readonly intervalMs: number;
  readonly propsUrl: string;
  readonly timeoutMs: number;
}

/** One probe: either the server answered in time, or it did not. */
interface ProbeResult {
  readonly latencyMs: number;
  readonly ok: boolean;
  readonly reason: string;
  readonly status: number;
}

/** Raised by `heartbeat check`, which is what makes the container unhealthy. */
class LlamaDownError extends Data.TaggedError("LlamaDownError")<{
  readonly reason: string;
  readonly url: string;
}> {
  override get message(): string {
    return `${Heartbeat.messages.probeFailed}: ${this.url} (${this.reason})`;
  }
}

export { type HeartbeatConfig, LlamaDownError, type ProbeResult };
