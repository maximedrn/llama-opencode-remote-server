import { Docker } from "@app/docker/docker.constants.ts";

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
    rotateKey: "Generate a new Llama API key",
    test: "Send a chat completion to the loopback port",
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
  local: {
    defaultPort: "8080",
    /** Only the loopback interface is ever addressed. */
    endpoint: (port: string): string =>
      `http://127.0.0.1:${port}/v1/chat/completions`,
    errorStatus: 400,
    fallbackAlias: "model",
    maxTokens: 32,
    prompt: "Reply with exactly OK",
    role: "user",
    /** Longest error body echoed back; upstreams may answer with a full page. */
    snippetLength: 200,
  },
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
      "Another service may be listening on that port; set LOCAL_PORT in .env " +
      "and restart the stack.",
    preflightOk: (backend: string): string =>
      `Preflight OK for backend=${backend}.`,
    requestFailed: (status: number, body: string): string =>
      `HTTP ${status}: ${body}`,
    rotated:
      "Llama API key rotated. Restart the stack and update trusted clients.",
    rotatedFingerprint: (value: string): string => `New fingerprint: ${value}`,
    secretsWritten: "Secrets written under ./secrets and ignored by Git.",
    windowsNvidia:
      "Windows NVIDIA mode requires Docker Desktop with the WSL2 backend and " +
      "current NVIDIA drivers.",
  },
} as const;

export { Stack };
