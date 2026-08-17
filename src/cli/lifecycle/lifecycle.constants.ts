/** Rotating a key and tearing the stack down: the two stateful operations. */
const Lifecycle = {
  messages: {
    llamaNotHealthy: (backend: string): string =>
      `llama.cpp is not healthy after the restart (backend=${backend}); ` +
      "run `bun run stack status` to inspect the stack.",
    purged: "Removed .env and secrets/ from this machine.",
    purgePrompt: "Also remove .env and secrets/ from this machine?",
    restartingLlama:
      "Restarting llama.cpp: it only reads its API key at startup.",
    rotated: "Llama API key rotated.",
    rotatedClients:
      "Update LLAMA_API_KEY in clients/client.env and every trusted client.",
    rotatedFingerprint: (value: string): string => `New fingerprint: ${value}`,
    stopped: "Stack stopped.",
  },
  /** How long `rotate-key` waits for llama.cpp to load the model again. */
  poll: {
    attempts: 60,
    delayMs: 5000,
  },
} as const;

export { Lifecycle };
