/**
 * The heartbeat exists because the llama.cpp images cannot be relied on for a
 * container healthcheck: several of them ship without curl (and some lag the
 * upstream build), so Compose had no trustworthy liveness signal. This process
 * polls the server over the internal network instead, and logs what it sees.
 */
const Heartbeat = {
  /** `check` runs a single probe and exits: that is the Compose healthcheck. */
  checkArgument: "check",
  defaults: {
    healthUrl: "http://llama:8080/health",
    intervalMs: 15_000,
    propsUrl: "http://llama:8080/props",
    timeoutMs: 5000,
  },
  exitCodes: {
    failure: 1,
    success: 0,
  },
  keys: {
    apiKeyFile: "LLAMA_API_KEY_FILE",
    healthUrl: "LLAMA_HEALTH_URL",
    intervalMs: "HEARTBEAT_INTERVAL_MS",
    propsUrl: "LLAMA_PROPS_URL",
    timeoutMs: "HEARTBEAT_TIMEOUT_MS",
  },
  messages: {
    build: "llama.cpp build",
    degraded: "llama.cpp stopped answering",
    probeFailed: "llama.cpp health probe failed",
    propsUnavailable: "llama.cpp did not report its build",
    recovered: "llama.cpp is answering again",
    serving: "llama.cpp is serving",
    started: "heartbeat started",
    stopped: "heartbeat stopped",
  },
  /** Longest error text kept in a log line; upstreams answer with pages. */
  reasonLength: 200,
  service: "heartbeat",
} as const;

export { Heartbeat };
