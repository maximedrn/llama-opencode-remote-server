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

/** Settings for both the Compose stack and the native server. */
const EnvFile = {
  keys: {
    backend: "BACKEND",
    batchSize: "BATCH_SIZE",
    batchThreads: "THREADS_BATCH",
    cacheK: "CACHE_TYPE_K",
    cacheV: "CACHE_TYPE_V",
    /**
     * Extra Compose file layered after the backend one. Not named
     * `COMPOSE_FILE`: Docker Compose reads that variable from `.env` itself and
     * would replace the whole file set with it.
     */
    composeFile: "COMPOSE_OVERRIDE_FILE",
    context: "CTX_SIZE",
    device: "DEVICE",
    draftTokens: "SPEC_DRAFT_N_MAX",
    fitTarget: "FIT_TARGET",
    flashAttention: "FLASH_ATTN",
    generationThreads: "THREADS",
    /** Enables the heartbeat front for Compose commands. */
    keepalive: "KEEPALIVE",
    loadMode: "LOAD_MODE",
    localPort: "LOCAL_PORT",
    modelAlias: "LLAMA_ALIAS",
    modelDirectory: "MODEL_DIRECTORY",
    modelFile: "MODEL_FILE",
    nativeServer: "NATIVE_SERVER_PATH",
    ubatchSize: "UBATCH_SIZE",
  },
  messages: {
    notInitialized: (missing: string): string =>
      `Set ${missing} in .env. If the file is missing, copy .env.example to .env first.`,
    readFailed: (file: string, reason: string): string =>
      `Could not read ${file}: ${reason}`,
  },
  nativeContext: "32768",
  path: projectPath(".env"),
} as const;

export { ClientFile, EnvFile };
