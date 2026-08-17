/** CLI identity, and everything `init` and `preflight` print. */
const Stack = {
  cli: {
    description: "Cross-platform manager for the Llama remote stack",
    name: "stack",
    version: "1.0.0",
  },
  messages: {
    aborted: (paths: readonly string[]): string =>
      `Aborted: kept the existing ${paths.join(", ")}; ` +
      "re-run init with --force to overwrite.",
    alreadyInitialized: (paths: readonly string[]): string =>
      `Already initialized (${paths.join(", ")}). Overwrite?`,
    failure: (reason: string): string => `Error: ${reason}`,
    fingerprint: (value: string): string =>
      `Llama API key SHA-256 fingerprint: ${value}`,
    initialized: (backend: string): string => `Initialized backend=${backend}`,
    keepaliveMode:
      "Keep-alive front enabled: clients reach llama.cpp through it, so a " +
      "silent generation cannot time the session out.",
    localMode:
      "Local-only mode: the reverse proxy and Cloudflare Tunnel stay stopped.",
    macosCpuOnly:
      "macOS Docker uses CPU inference only here; Metal is not exposed to " +
      "Linux containers.",
    modelPath: (path: string): string => `Model: ${path}`,
    nextStep: "Next: bun run stack preflight",
    preflightOk: (backend: string): string =>
      `Preflight OK for backend=${backend}.`,
    secretsWritten: "Secrets written under ./secrets and ignored by Git.",
    windowsNvidia:
      "Windows NVIDIA mode requires Docker Desktop with the WSL2 backend and " +
      "current NVIDIA drivers.",
  },
} as const;

export { Stack };
