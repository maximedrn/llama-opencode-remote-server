import { Project } from "@app/cli/system/project/project.constants.ts";

/** Absolute path of a repository-relative file, always forward-slashed. */
const projectPath = (relative: string): string => `${Project.root}${relative}`;

export { projectPath };
