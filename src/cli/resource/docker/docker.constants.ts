/** Docker CLI vocabulary; Compose lives in `docker/`, the project root does not. */
const Docker = {
  cli: "docker",
  compose: {
    /** The file defining llama.cpp; `--compose-file` replaces this one. */
    backendFile: (backend: string): string =>
      `docker/docker-compose.${backend}.yaml`,
    /** Proxy, tunnel, networks and secrets: never replaced. */
    baseFile: "docker/docker-compose.yaml",
    /** Opt-in keep-alive front between the proxy and llama.cpp. */
    keepaliveFile: "docker/docker-compose.keepalive.yaml",
    /** Local mode with the keep-alive front: it is the published service. */
    keepaliveLocalFile: "docker/docker-compose.keepalive.local.yaml",
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
     * keep-alive front restarts with it so it reconnects to a fresh process.
     */
    restart: (services: readonly string[]): readonly string[] => [
      "restart",
      ...services,
    ],
  },
} as const;

export { Docker };
