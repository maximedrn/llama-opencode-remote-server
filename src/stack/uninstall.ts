import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import { EnvFile } from "@app/env/env.constants.ts";
import { Secrets } from "@app/secret/secret.constants.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type {
  StackDependencies,
  UninstallError,
} from "@app/stack/stack.interface.ts";
import { Prompt } from "@effect/cli";
import { Console, Effect } from "effect";

const purgePrompt: string = "Also remove .env and secrets/ from this machine?";

const removeQuietly = (
  dependencies: StackDependencies,
  path: string,
  recursive: boolean,
): Effect.Effect<void> =>
  dependencies.fileSystem
    .remove(path, { recursive })
    .pipe(Effect.catchAll((): Effect.Effect<void> => Effect.void));

/**
 * `local: false` on the way down on purpose: the edge profile has to be named
 * for Compose to stop the proxy and the tunnel too.
 */
const uninstall = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
): Effect.Effect<void, UninstallError, Prompt.Prompt.Environment> =>
  Effect.gen(function* () {
    yield* dependencies.docker.assertAvailable;
    yield* dependencies.docker.compose(backend, Docker.verbs.down, {
      ...options,
      local: false,
    });
    yield* Console.log(Stack.messages.stopped);
    const purge: boolean = yield* Prompt.run(
      Prompt.confirm({ initial: false, message: purgePrompt }),
    );
    if (!purge) return;
    yield* removeQuietly(dependencies, EnvFile.path, false);
    yield* removeQuietly(dependencies, Secrets.directory, true);
    yield* Console.log(Stack.messages.purged);
  });

export { uninstall };
