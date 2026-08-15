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
    envFile: "--env-file",
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
    llama: "llama",
  },
  verbs: {
    config: ["config", "--quiet"],
  },
} as const;

export { Docker };
