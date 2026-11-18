import { projectPath } from "@app/cli/system/project/project.utils.ts";

/** Configuration and state for llama.cpp running outside Docker on Windows. */
const Native = {
  defaults: {
    cache: "q8_0",
    flashAttention: "auto",
    port: "8080",
  },
  devices: {
    hip: "ROCm0",
    vulkan: "Vulkan0",
  },
  directory: projectPath(".runtime/native"),
  files: {
    errorLog: projectPath(".runtime/native/llama.stderr.log"),
    outputLog: projectPath(".runtime/native/llama.stdout.log"),
    state: projectPath(".runtime/native/llama.json"),
  },
  messages: {
    alreadyRunning: (pid: number): string =>
      `llama.cpp is already running (PID ${pid}).`,
    invalidConfiguration: (key: string): string =>
      `Invalid ${key} in .env; provide an absolute path or a positive integer.`,
    nativeOnly: "Native Vulkan/HIP is available only on Windows with --local.",
    noPull: "Native llama.cpp binaries are installed manually; see README.md.",
    notRunning: "Native llama.cpp is not running.",
    processChanged:
      "Saved PID does not match the expected executable; refusing to stop it.",
    started: (pid: number): string =>
      `Started PID ${pid}. Run \`bun run stack health\` after model loading.`,
    stopped: "Native llama.cpp stopped.",
  },
} as const;

export { Native };
