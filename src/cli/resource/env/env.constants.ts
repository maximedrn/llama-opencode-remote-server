import { projectPath } from "@app/cli/system/project/project.utils.ts";

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
  /** Written for the flags `init` remembers; anything blank counts as off. */
  enabled: "true",
  keys: {
    backend: "BACKEND",
    batchThreads: "THREADS_BATCH",
    /**
     * Extra Compose file layered after the backend one. Not named
     * `COMPOSE_FILE`: Docker Compose reads that variable from `.env` itself and
     * would replace the whole file set with it.
     */
    composeFile: "COMPOSE_OVERRIDE_FILE",
    generationThreads: "THREADS",
    /** Remembers `init --keepalive`, so later commands layer the same files. */
    keepalive: "KEEPALIVE",
    /**
     * Single llama.cpp image for every backend: each Compose file falls back to
     * the tag built for its accelerator, so this stays empty unless a specific
     * build has to be pinned.
     */
    llamaImage: "LLAMA_IMAGE",
    localPort: "LOCAL_PORT",
    modelAlias: "LLAMA_ALIAS",
    modelDirectory: "MODEL_DIRECTORY",
    modelFile: "MODEL_FILE",
  },
  messages: {
    notInitialized: (missing: string): string =>
      `Run \`init\` first: .env is missing ${missing}.`,
    readFailed: (file: string, reason: string): string =>
      `Could not read ${file}: ${reason}`,
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
    ["COMPOSE_OVERRIDE_FILE", ""],
    ["CTX_SIZE", "262144"],
    ["FIT_TARGET", "768"],
    ["FLASH_ATTN", "auto"],
    ["LLAMA_IMAGE", ""],
    ["LOAD_MODE", "mmap+mlock"],
    ["NVIDIA_DEVICE", "CUDA0"],
    ["SPEC_DRAFT_N_MAX", "3"],
    ["SPEC_DRAFT_P_MAX", "0.7"],
    ["UBATCH_SIZE", "512"],
  ],
} as const;

export { ClientFile, EnvFile };
