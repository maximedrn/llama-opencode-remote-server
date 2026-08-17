import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import { Project } from "@app/project/project.constants.ts";
import { Option } from "effect";

/** Extra `-f` layer, last so a custom file overrides the shipped ones. */
const overrideArgs = (options: ComposeOptions): readonly string[] =>
  Option.match(Option.fromNullable(options.overrideFile), {
    onNone: (): readonly string[] => [],
    onSome: (file: string): readonly string[] => [Docker.flags.file, file],
  });

/**
 * The project directory is pinned to the repository root so the `./nginx` and
 * `./secrets` bind mounts stay resolvable from `docker/`.
 */
const composeArgs = (
  backend: Backend,
  options: ComposeOptions,
): readonly string[] => [
  Docker.compose.subcommand,
  Docker.flags.projectDirectory,
  Project.root,
  ...(options.local === true
    ? []
    : [Docker.flags.profile, Docker.profiles.edge]),
  Docker.flags.file,
  Docker.compose.baseFile,
  Docker.flags.file,
  Docker.compose.backendFile(backend),
  ...(options.local === true
    ? [Docker.flags.file, Docker.compose.localFile]
    : []),
  ...overrideArgs(options),
];

export { composeArgs };
