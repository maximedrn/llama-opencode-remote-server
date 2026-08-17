import { Backends } from "@app/cli/resource/backend/backend.constants.ts";

/** Labels double as the identifiers `--json` consumers match on. */
const Doctor = {
  checks: {
    compose: "Compose files",
    devices: "GPU devices",
    docker: "Docker daemon",
    host: "Host compatibility",
    model: "Model file",
    reachable: "Llama reachable",
    secrets: "Secrets",
  },
  fixes: {
    compose: "Fix .env or the Compose files, then run doctor again.",
    devices: "Grant the container access to /dev/kfd and /dev/dri.",
    docker: "Install Docker or start the daemon, then run doctor again.",
    host: `Pick a compatible backend: bun run stack init --backend ${Backends.fallback}`,
    model: "Run init again, or copy the model into MODEL_DIRECTORY.",
    reachable:
      "Start the stack (bun run stack up), then check clients/client.env.",
    secrets: "Run init again to recreate the secrets.",
  },
  messages: {
    needsAttention: (labels: readonly string[]): string =>
      `Doctor: ${labels.join(", ")} need attention.`,
  },
} as const;

export { Doctor };
