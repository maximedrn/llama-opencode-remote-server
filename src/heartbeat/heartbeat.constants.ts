/** Strips the trailing slash of the configured upstream URL. */
const trailingSlash: RegExp = /\/+$/;

/**
 * Why this process exists: llama.cpp only writes to the response once it has a
 * token to send. Prompt processing on a long context is silent for minutes,
 * and a silent connection is what Cloudflare, Nginx and the client SDK all
 * count as idle before closing it — the session dies mid-request.
 *
 * So this is not a monitor: it sits *between* the reverse proxy and llama.cpp,
 * relays the request untouched and, while the upstream says nothing, writes an
 * SSE comment every few seconds. The bytes keep every hop alive and are
 * ignored by any SSE client. It is optional because a llama.cpp build that
 * already emits its own keep-alive needs no such layer.
 */
const Heartbeat = {
  /** `check` runs one probe against this process and exits: the healthcheck. */
  checkArgument: "check",
  defaults: {
    /** Bun caps the socket idle timeout at 255s, and closes after 10s without
     * one. Relayed requests opt out of it entirely, see `noRequestTimeout`. */
    idleTimeoutSeconds: 255,
    keepAliveMs: 10_000,
    port: 8081,
    probeTimeoutMs: 5000,
    upstreamUrl: "http://llama:8080",
  },
  headers: {
    /** Streaming answers must not be buffered by anything downstream. */
    cacheControl: ["Cache-Control", "no-cache, no-transform"],
    contentType: "content-type",
    /** Nginx honours this even with proxy_buffering already off. */
    noBuffering: ["X-Accel-Buffering", "no"],
  },
  /** Headers a proxy must not copy from the client request. */
  hopByHopHeaders: [
    "connection",
    "content-length",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ],
  /** An SSE comment: valid in the stream, invisible to every client. */
  keepAliveComment: ": keep-alive\n\n",
  keys: {
    apiKeyFile: "LLAMA_API_KEY_FILE",
    idleTimeoutSeconds: "HEARTBEAT_IDLE_TIMEOUT_S",
    keepAliveMs: "HEARTBEAT_KEEPALIVE_MS",
    port: "HEARTBEAT_PORT",
    probeTimeoutMs: "HEARTBEAT_TIMEOUT_MS",
    upstreamUrl: "LLAMA_UPSTREAM_URL",
  },
  messages: {
    build: "llama.cpp build",
    clientGone:
      "the client hung up; llama.cpp is told to drop the task it was working on",
    committed:
      "llama.cpp is still silent: answering the stream and holding it open",
    keepAlive: "keep-alive sent while llama.cpp was silent",
    listening: "keep-alive front listening",
    probeFailed: "llama.cpp did not answer the health probe",
    propsUnavailable: "llama.cpp did not report its build",
    proxied: "request relayed",
    upstreamFailed: "llama.cpp refused the connection",
  },
  /**
   * Seconds of silence Bun tolerates on a relayed connection: none, because
   * prompt processing on a long context says nothing for minutes and a
   * non-streamed answer cannot be padded with comments. llama.cpp then sees
   * its peer disappear and cancels the task (`should_stop`), which is exactly
   * the failure this process exists to prevent.
   */
  noRequestTimeout: 0,
  paths: {
    health: "/health",
    props: "/props",
  },
  /** Longest error text kept in a log line; upstreams answer with pages. */
  reasonLength: 200,
  service: "heartbeat",
  /** Media type marking an answer this process has to keep flowing. */
  streamContentType: "text/event-stream",
  /**
   * Once the SSE answer is committed, its status is already sent: a failing
   * upstream can only be reported inside the stream, as an error event a
   * client understands, followed by the end-of-stream marker it waits for.
   */
  streamError: (reason: string): string =>
    `data: ${JSON.stringify({ error: { message: reason } })}\n\ndata: [DONE]\n\n`,
  /** Field of the OpenAI request asking for a streamed answer. */
  streamField: "stream",
  upstreamStatus: {
    badGateway: 502,
    ok: 200,
  },
} as const;

export { Heartbeat, trailingSlash };
