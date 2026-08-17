/** Every string the CLI surface shows: option names, descriptions, output. */
const Commands = {
  descriptions: {
    backend: "Hardware backend; defaults to BACKEND from .env",
    client:
      "Client-side checks only: no Docker, no model, no secrets on this host",
    composeFile:
      "Compose file defining llama.cpp, replacing the shipped backend one; " +
      "defaults to COMPOSE_OVERRIDE_FILE",
    doctor: "Check every piece the stack needs, with a fix for each failure",
    force: "Overwrite an existing .env and secrets without asking",
    health: "One-token completion proving the server answers and the key works",
    hfInclude: "Glob selecting the files to download from the repository",
    hfRepo: "Hugging Face repository to download the model from",
    init: "Resolve the model source, then write .env and secrets",
    json: "Print machine-readable JSON",
    keepalive:
      "Put the keep-alive front between the proxy and llama.cpp; defaults to " +
      "KEEPALIVE from .env",
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
  /** Compose lifecycle commands differ only by their Compose arguments. */
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
  /** Long option names, so a rename never drifts from its description. */
  options: {
    backend: "backend",
    client: "client",
    composeFile: "compose-file",
    force: "force",
    hfInclude: "hf-include",
    hfRepository: "hf-repository",
    json: "json",
    keepalive: "keepalive",
    local: "local",
    modelDirectory: "model-directory",
    modelFile: "model-file",
    modelUrl: "model-url",
    service: "service",
  },
  output: {
    /** Bytes in a gibibyte: model sizes are unreadable in bytes. */
    bytesPerGibibyte: 1024 ** 3,
    failPrefix: "FAIL  ",
    fixPrefix: "  [fix: ",
    fixSuffix: "]",
    jsonIndent: 2,
    noModels: "No model found: neither .env nor the server lists one.",
    noServices: "No container: run `bun run stack up` first.",
    okPrefix: "OK    ",
    separator: "  --  ",
    sizeUnit: " GiB",
    /** Columns of `status`, tab-separated so `cut` and `awk` can read them. */
    tab: "\t",
  },
} as const;

export { Commands };
