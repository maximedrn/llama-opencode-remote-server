import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { Data, type Option } from "effect";

/** Everything the container is configured with, resolved once at startup. */
interface HeartbeatConfig {
  /** Bearer token read from the mounted Docker secret, when there is one. */
  readonly apiKey: Option.Option<string>;
  /** Silence tolerated before a keep-alive comment is written. */
  readonly keepAliveMs: number;
  readonly port: number;
  readonly probeTimeoutMs: number;
  readonly upstreamUrl: string;
}

/** One probe: either llama.cpp answered in time, or it did not. */
interface ProbeResult {
  readonly latencyMs: number;
  readonly ok: boolean;
  readonly reason: string;
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
