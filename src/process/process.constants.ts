/** Child process defaults; every command runs directly, never through a shell. */
const ChildProcess = {
  messages: {
    commandFailed: (command: string, exitCode: number): string =>
      `\`${command}\` exited with code ${exitCode}.`,
  },
  stdio: {
    inherit: "inherit",
    pipe: "pipe",
  },
  successExitCode: 0,
} as const;

export { ChildProcess };
