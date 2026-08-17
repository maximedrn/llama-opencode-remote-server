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
    /** Bun caps the socket idle timeout at 255s; keep-alives arrive earlier. */
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
    keepAliveMs: "HEARTBEAT_KEEPALIVE_MS",
    port: "HEARTBEAT_PORT",
    probeTimeoutMs: "HEARTBEAT_TIMEOUT_MS",
    upstreamUrl: "LLAMA_UPSTREAM_URL",
  },
  messages: {
    build: "llama.cpp build",
    committed:
      "llama.cpp is still silent: answering the stream and holding it open",
    keepAlive: "keep-alive sent while llama.cpp was silent",
    listening: "keep-alive front listening",
    probeFailed: "llama.cpp did not answer the health probe",
    propsUnavailable: "llama.cpp did not report its build",
    proxied: "request relayed",
    upstreamFailed: "llama.cpp refused the connection",
  },
  paths: {
    health: "/health",
    props: "/props",
  },
  /** Longest error text kept in a log line; upstreams answer with pages. */
  reasonLength: 200,
  service: "heartbeat",
  /** Media type marking an answer this process has to keep flowing. */
  streamContentType: "text/event-stream",
  /** Field of the OpenAI request asking for a streamed answer. */
  streamField: "stream",
  upstreamStatus: {
    badGateway: 502,
    ok: 200,
  },
} as const;

export { Heartbeat, trailingSlash };
