/** Docker CLI vocabulary; Compose lives in `docker/`, the project root does not. */
const Docker = {
  cli: "docker",
  compose: {
    backendFile: (backend: string): string =>
      `docker/docker-compose.${backend}.yaml`,
    baseFile: "docker/docker-compose.yaml",
    localFile: "docker/docker-compose.local.yaml",
    subcommand: "compose",
  },
  flags: {
    file: "-f",
    profile: "--profile",
    projectDirectory: "--project-directory",
  },
  messages: {
    composeMissing: "Docker Compose v2 is required (`docker compose`).",
    daemonMissing: "Docker is not installed or the daemon is not running.",
  },
  probeArgs: {
    compose: ["compose", "version"],
    engine: ["version"],
  },
  /** Edge profile: the reverse proxy and the Cloudflare Tunnel. */
  profiles: {
    edge: "edge",
  },
  services: {
    cloudflared: "cloudflared",
    heartbeat: "heartbeat",
    llama: "llama",
    proxy: "proxy",
  },
  /** Compose health strings, as `docker compose ps --format json` reports them. */
  states: {
    healthy: "healthy",
    running: "running",
  },
  verbs: {
    config: ["config", "--quiet"],
    down: ["down"],
    logs: (service: string): readonly string[] => ["logs", "-f", service],
    psJson: ["ps", "--format", "json", "--all"],
    /**
     * Compose bind mounts a `file:` secret, so the container sees the new key
     * as soon as it is written; llama.cpp has to read it again, and the
     * heartbeat restarts with it so its health reflects the new process.
     */
    restartLlama: ["restart", "llama", "heartbeat"],
  },
} as const;

export { Docker };
