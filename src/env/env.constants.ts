import { projectPath } from "@app/project/project.utils.ts";

/**
 * The credentials a client uses to reach the stack. `test` reads them, so it
 * exercises the very same endpoint and headers as OpenCode does.
 */
const ClientFile = {
  keys: {
    accessClientId: "CLOUDFLARE_ACCESS_CLIENT_ID",
    accessClientSecret: "CLOUDFLARE_ACCESS_CLIENT_SECRET",
    apiKey: "LLAMA_API_KEY",
    baseUrl: "LLAMA_BASE_URL",
  },
  messages: {
    missing: (variable: string): string =>
      `clients/client.env has no ${variable}. Copy client.env.example and ` +
      "fill it in: LLAMA_BASE_URL is the loopback port locally, or the " +
      "Cloudflare hostname remotely.",
  },
  path: projectPath("clients/client.env"),
} as const;

/** Everything written to, or read from, the Compose `.env` file. */
const EnvFile = {
  /**
   * Rolling image tags on purpose: the stack always runs the latest published
   * images. Pin them in `.env` when a deployment has to be reproducible.
   */
  images: [
    ["CLOUDFLARED_IMAGE", "cloudflare/cloudflared:latest"],
    ["LLAMA_AMD_IMAGE", "ghcr.io/ggml-org/llama.cpp:server-rocm"],
    ["LLAMA_CPU_IMAGE", "ghcr.io/ggml-org/llama.cpp:server"],
    ["LLAMA_NVIDIA_IMAGE", "ghcr.io/ggml-org/llama.cpp:server-cuda"],
    ["PROXY_IMAGE", "nginxinc/nginx-unprivileged:latest"],
  ],
  keys: {
    backend: "BACKEND",
    batchThreads: "THREADS_BATCH",
    generationThreads: "THREADS",
    localPort: "LOCAL_PORT",
    modelAlias: "LLAMA_ALIAS",
    modelDirectory: "MODEL_DIRECTORY",
    modelFile: "MODEL_FILE",
  },
  messages: {
    notInitialized: (missing: string): string =>
      `Run \`init\` first: .env is missing ${missing}.`,
  },
  path: projectPath(".env"),
  /** llama.cpp runtime profile written on `init`; tune it in `.env` afterwards. */
  /** Loopback port published by `--local`; 8080 is often already taken. */
  runtime: [
    ["LOCAL_PORT", "8080"],
    ["AMD_DEVICE", "ROCm0"],
    ["BATCH_SIZE", "2048"],
    ["CACHE_TYPE_K", "q8_0"],
    ["CACHE_TYPE_V", "q8_0"],
    ["CTX_SIZE", "262144"],
    ["FIT_TARGET", "768"],
    ["FLASH_ATTN", "auto"],
    ["LOAD_MODE", "mmap+mlock"],
    ["NVIDIA_DEVICE", "CUDA0"],
    ["SPEC_DRAFT_N_MAX", "64"],
    ["UBATCH_SIZE", "512"],
  ],
} as const;

export { ClientFile, EnvFile };
