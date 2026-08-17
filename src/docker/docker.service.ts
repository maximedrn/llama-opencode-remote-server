import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import type { DockerApi } from "@app/docker/docker.interface.ts";
import {
  type ComposeOptions,
  DockerUnavailableError,
} from "@app/docker/docker.types.ts";
import { composeArgs } from "@app/docker/docker.utils.ts";
import { ProcessService } from "@app/process/process.service.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";

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

    /** Same command as `compose`, but its output comes back as a value. */
    const composeCaptured = (
      backend: Backend,
      args: readonly string[],
      options?: ComposeOptions,
    ): Effect.Effect<string, CommandFailedError | PlatformError> =>
      processes.runCaptured(Docker.cli, [
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

    const api: DockerApi = { assertAvailable, compose, composeCaptured };
    return api;
  }),
}) {}

export { DockerService };
