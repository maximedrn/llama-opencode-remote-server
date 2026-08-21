/** Strips a trailing slash from LLAMA_BASE_URL before appending the path. */
const trailingSlash: RegExp = /\/+$/;

/** Everything the CLI needs to talk to the endpoint a client is pointed at. */
const Client = {
  messages: {
    healthy: "Healthy: the server answered and accepted the API key.",
    llamaAuth: (endpoint: string): string =>
      `${endpoint} rejected the API key (401/403). Check LLAMA_API_KEY and ` +
      "the Cloudflare Access token in clients/client.env.",
    llamaUnreachable: (endpoint: string, reason: string): string =>
      `${endpoint} did not answer (${reason}). Start the stack ` +
      "(bun run stack up) or check LLAMA_BASE_URL in clients/client.env.",
    notLlamaServer: (endpoint: string, reason: string): string =>
      `${endpoint} did not answer with an OpenAI chat completion (${reason}). ` +
      "Another service may be listening there; check LLAMA_BASE_URL in " +
      "clients/client.env.",
    requestFailed: (status: number, body: string): string =>
      `HTTP ${status}: ${body}`,
    timedOut: (timeoutMs: number): string => `no answer within ${timeoutMs}ms`,
  },
  /** The request itself, against whatever `clients/client.env` points at. */
  smoke: {
    /** Statuses meaning the credentials were refused, not the request. */
    authStatuses: [401, 403],
    /** HTTP status from which on the answer is a failure, not a completion. */
    errorStatus: 400,
    /** Mirrors `${LLAMA_ALIAS:-llama}` in the Compose files: a blank alias in
     * `.env` makes llama.cpp serve the model under that name, and asking for
     * anything else answers a model-not-found error. */
    fallbackAlias: "llama",
    /** Cloudflare Access service token headers, stripped again by Nginx. */
    headers: {
      accessClientId: "CF-Access-Client-Id",
      accessClientSecret: "CF-Access-Client-Secret",
    },
    /** A health probe only needs one token to prove the key is accepted. */
    healthMaxTokens: 1,
    maxTokens: 32,
    /** Model listing path, appended to LLAMA_BASE_URL. */
    modelsPath: "/v1/models",
    /** Chat completion path, appended to LLAMA_BASE_URL. */
    path: "/v1/chat/completions",
    prompt: "Reply with exactly OK",
    role: "user",
    /** Longest error body echoed back; upstreams may answer with a full page. */
    snippetLength: 200,
    /** A cold model load is slow, but an unanswered request is not a hang. */
    timeoutMs: 30_000,
  },
} as const;

export { Client, trailingSlash };
