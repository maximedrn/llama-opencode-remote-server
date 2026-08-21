/**
 * Repository root, resolved from this module so the CLI works from any cwd.
 * The depth mirrors this file's own location, `src/cli/system/project/`, and
 * `project.constants.test.ts` fails the build if the two ever drift apart.
 */
const Project = {
  root: Bun.fileURLToPath(new URL("../../../../", import.meta.url)),
} as const;

export { Project };
