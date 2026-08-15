/** Repository root, resolved from this module so the CLI works from any cwd. */
const Project = {
  root: Bun.fileURLToPath(new URL("../../", import.meta.url)),
} as const;

export { Project };
