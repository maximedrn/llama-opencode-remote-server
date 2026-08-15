import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import type { DockerApi } from "@app/docker/docker.interface.ts";
import {
  type ComposeOptions,
  DockerUnavailableError,
} from "@app/docker/docker.types.ts";
import { ProcessService } from "@app/process/process.service.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import { Project } from "@app/project/project.constants.ts";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Option, Predicate } from "effect";

const envFileArgs = (envFile: string | undefined): readonly string[] =>
  Option.fromNullable(envFile).pipe(
    Option.filter(Predicate.isNotNullable),
    Option.match({
      onNone: (): readonly string[] => [],
      onSome: (file: string): readonly string[] => [Docker.flags.envFile, file],
    }),
  );

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
  ...envFileArgs(options.envFile),
  Docker.flags.file,
  Docker.compose.baseFile,
  Docker.flags.file,
  Docker.compose.backendFile(backend),
  ...(options.local === true
    ? [Docker.flags.file, Docker.compose.localFile]
    : []),
];

class DockerService extends Effect.Service<DockerService>()("DockerService", {
  dependencies: [ProcessService.Default],
  effect: Effect.gen(function* () {
    const processes: ProcessService = yield* ProcessService;

    const compose = (
      backend: Backend,
      args: readonly string[],
      options?: ComposeOptions,
    ): Effect.Effect<void, CommandFailedError | PlatformError> =>
      processes.run(Docker.cli, [
        ...composeArgs(backend, options ?? {}),
        ...args,
      ]);

    const isAvailable: Effect.Effect<boolean> = processes.succeeds(
      Docker.cli,
      Docker.probeArgs.compose,
    );

    const assertAvailable: Effect.Effect<void, DockerUnavailableError> =
      Effect.gen(function* () {
        const hasEngine: boolean = yield* processes.succeeds(
          Docker.cli,
          Docker.probeArgs.engine,
        );
        if (!hasEngine) {
          return yield* new DockerUnavailableError({
            reason: Docker.messages.daemonMissing,
          });
        }
        if (!(yield* isAvailable)) {
          return yield* new DockerUnavailableError({
            reason: Docker.messages.composeMissing,
          });
        }
      });

    const api: DockerApi = { assertAvailable, compose };
    return api;
  }),
}) {}

export { DockerService };
