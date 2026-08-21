import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { Data, type Option, type Runtime } from "effect";

/** Everything the container is configured with, resolved once at startup. */
interface HeartbeatConfig {
  /** Bearer token read from the mounted Docker secret, when there is one. */
  readonly apiKey: Option.Option<string>;
  /** Seconds of silence Bun tolerates on a connection it is not relaying. */
  readonly idleTimeoutSeconds: number;
  /** Silence tolerated before a keep-alive comment is written. */
  readonly keepAliveMs: number;
  readonly port: number;
  readonly probeTimeoutMs: number;
  /** Logs the bodies going through, for the day an agent hangs on a tool call. */
  readonly trace: boolean;
  readonly upstreamUrl: string;
}

/** One probe: either llama.cpp answered in time, or it did not. */
interface ProbeResult {
  readonly latencyMs: number;
  readonly ok: boolean;
  readonly reason: string;
}

/** The runtime of the fiber that started the server, so the request handlers
 * — plain async functions — log through the same logger and annotations. */
type Host = Runtime.Runtime<never>;

/**
 * What the front sends to llama.cpp. `timeout` is honoured by Bun's fetch but
 * absent from its types (1.3.14), and it is the option that matters most here:
 * the default gives up after 300 seconds of silence, which is less than the
 * prompt processing of a long context.
 */
interface UpstreamRequest extends RequestInit {
  readonly timeout: false;
}

interface RequestSummary {
  readonly asked: boolean;
  readonly model: string;
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

export {
  type HeartbeatConfig,
  type Host,
  LlamaDownError,
  type ProbeResult,
  type RequestSummary,
  type UpstreamRequest,
};
