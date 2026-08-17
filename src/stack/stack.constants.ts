/** Strips a trailing slash from LLAMA_BASE_URL before appending the path. */
const trailingSlash: RegExp = /\/+$/;

/** CLI surface: command names, descriptions and the messages they print. */
const Stack = {
  cli: {
    description: "Cross-platform manager for the Llama remote stack",
    name: "stack",
    version: "1.0.0",
  },
  descriptions: {
    backend: "Hardware backend; defaults to BACKEND from .env",
    client:
      "Client-side checks only: no Docker, no model, no secrets on this host",
    composeFile:
      "Extra Compose file layered last; defaults to COMPOSE_OVERRIDE_FILE",
    doctor: "Check every piece the stack needs, with a fix for each failure",
    force: "Overwrite an existing .env and secrets without asking",
    health: "One-token completion proving the server answers and the key works",
    hfInclude: "Glob selecting the files to download from the repository",
    hfRepo: "Hugging Face repository to download the model from",
    init: "Resolve the model source, then write .env and secrets",
    json: "Print machine-readable JSON",
    local: "Local-only stack: no reverse proxy, no Cloudflare Tunnel",
    logs: "Follow the logs of one service",
    modelDir: "Host directory holding (or receiving) the model files",
    modelFile: "Path to a model file already on this host",
    models:
      "List the local .gguf files, or what the server serves on a client host",
    modelUrl: "Direct download link to a model file",
    preflight: "Check Docker, the model, the secrets and the Compose files",
    rotateKey: "Generate a new Llama API key, then restart llama.cpp",
    service: "Service whose logs to follow",
    status: "Report the state and health of every service",
    test: "Send a chat completion using clients/client.env",
    uninstall: "Stop the whole stack and offer to remove .env and secrets/",
  },
  /**
   * Compose lifecycle commands differ only by their Compose arguments; each one
   * takes `--local` to run without the reverse proxy and the tunnel.
   */
  lifecycle: [
    {
      args: ["pull"],
      description: "Pull the images for the selected backend",
      name: "pull",
    },
    {
      args: ["up", "-d"],
      description: "Start the stack in the background",
      name: "up",
    },
    {
      args: ["down"],
      description: "Stop the stack",
      name: "down",
    },
    {
      args: ["restart"],
      description: "Restart the stack",
      name: "restart",
    },
  ],
  messages: {
    aborted: (paths: readonly string[]): string =>
      `Aborted: kept the existing ${paths.join(", ")}; ` +
      "re-run init with --force to overwrite.",
    failure: (reason: string): string => `Error: ${reason}`,
    fingerprint: (value: string): string =>
      `Llama API key SHA-256 fingerprint: ${value}`,
    healthy: "Healthy: the server answered and accepted the API key.",
    initialized: (backend: string): string => `Initialized backend=${backend}`,
    llamaAuth: (endpoint: string): string =>
      `${endpoint} rejected the API key (401/403). Check LLAMA_API_KEY and ` +
      "the Cloudflare Access token in clients/client.env.",
    llamaNotHealthy: (backend: string): string =>
      `llama.cpp is not healthy after the restart (backend=${backend}); ` +
      "run `bun run stack status` to inspect the stack.",
    llamaUnreachable: (endpoint: string, reason: string): string =>
      `${endpoint} did not answer (${reason}). Start the stack ` +
      "(bun run stack up) or check LLAMA_BASE_URL in clients/client.env.",
    localMode:
      "Local-only mode: the reverse proxy and Cloudflare Tunnel stay stopped.",
    macosCpuOnly:
      "macOS Docker uses CPU inference only here; Metal is not exposed to " +
      "Linux containers.",
    modelPath: (path: string): string => `Model: ${path}`,
    needsAttention: (labels: readonly string[]): string =>
      `Doctor: ${labels.join(", ")} need attention.`,
    nextStep: "Next: bun run stack preflight",
    noModels: "No model found: neither .env nor the server lists one.",
    noServices: "No container: run `bun run stack up` first.",
    notLlamaServer: (endpoint: string, reason: string): string =>
      `${endpoint} did not answer with an OpenAI chat completion (${reason}). ` +
      "Another service may be listening there; check LLAMA_BASE_URL in " +
      "clients/client.env.",
    preflightOk: (backend: string): string =>
      `Preflight OK for backend=${backend}.`,
    purged: "Removed .env and secrets/ from this machine.",
    requestFailed: (status: number, body: string): string =>
      `HTTP ${status}: ${body}`,
    restartingLlama:
      "Restarting llama.cpp: it only reads its API key at startup.",
    rotated: "Llama API key rotated.",
    rotatedClients:
      "Update LLAMA_API_KEY in clients/client.env and every trusted client.",
    rotatedFingerprint: (value: string): string => `New fingerprint: ${value}`,
    secretsWritten: "Secrets written under ./secrets and ignored by Git.",
    served: (endpoint: string): string => `Served by ${endpoint}:`,
    stopped: "Stack stopped.",
    windowsNvidia:
      "Windows NVIDIA mode requires Docker Desktop with the WSL2 backend and " +
      "current NVIDIA drivers.",
  },
  /** How long `rotate-key` waits for llama.cpp to load the model again. */
  poll: {
    attempts: 60,
    delayMs: 5000,
  },
  /** The smoke test, against whatever `clients/client.env` points at. */
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

export { Stack, trailingSlash };
