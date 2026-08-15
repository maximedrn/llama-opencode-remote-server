import { Docker } from "@app/docker/docker.constants.ts";

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
    hfInclude: "Glob selecting the files to download from the repository",
    hfRepo: "Hugging Face repository to download the model from",
    init: "Resolve the model source, then write .env and secrets",
    local: "Local-only stack: no reverse proxy, no Cloudflare Tunnel",
    modelDir: "Host directory holding (or receiving) the model files",
    modelFile: "Path to a model file already on this host",
    modelUrl: "Direct download link to a model file",
    preflight: "Check Docker, the model, the secrets and the Compose files",
    rotateKey: "Generate a new Llama API key, then restart llama.cpp",
    test: "Send a chat completion using clients/client.env",
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
    {
      args: ["ps"],
      description: "Show container status",
      name: "status",
    },
    {
      args: ["logs", "-f", Docker.services.llama],
      description: "Follow the llama.cpp logs",
      name: "logs",
    },
  ],
  messages: {
    failure: (reason: string): string => `Error: ${reason}`,
    fingerprint: (value: string): string =>
      `Llama API key SHA-256 fingerprint: ${value}`,
    initialized: (backend: string): string => `Initialized backend=${backend}`,
    localMode:
      "Local-only mode: the reverse proxy and Cloudflare Tunnel stay stopped.",
    macosCpuOnly:
      "macOS Docker uses CPU inference only here; Metal is not exposed to " +
      "Linux containers.",
    modelPath: (path: string): string => `Model: ${path}`,
    nextStep: "Next: bun run stack preflight",
    notLlamaServer: (endpoint: string, reason: string): string =>
      `${endpoint} did not answer with an OpenAI chat completion (${reason}). ` +
      "Another service may be listening there; check LLAMA_BASE_URL in " +
      "clients/client.env.",
    preflightOk: (backend: string): string =>
      `Preflight OK for backend=${backend}.`,
    requestFailed: (status: number, body: string): string =>
      `HTTP ${status}: ${body}`,
    restartingLlama:
      "Restarting llama.cpp: it only reads its API key at startup.",
    rotated: "Llama API key rotated.",
    rotatedClients:
      "Update LLAMA_API_KEY in clients/client.env and every trusted client.",
    rotatedFingerprint: (value: string): string => `New fingerprint: ${value}`,
    secretsWritten: "Secrets written under ./secrets and ignored by Git.",
    windowsNvidia:
      "Windows NVIDIA mode requires Docker Desktop with the WSL2 backend and " +
      "current NVIDIA drivers.",
  },
  /** The smoke test, against whatever `clients/client.env` points at. */
  smoke: {
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
    maxTokens: 32,
    /** Chat completion path, appended to LLAMA_BASE_URL. */
    path: "/v1/chat/completions",
    prompt: "Reply with exactly OK",
    role: "user",
    /** Longest error body echoed back; upstreams may answer with a full page. */
    snippetLength: 200,
  },
} as const;

export { Stack, trailingSlash };
