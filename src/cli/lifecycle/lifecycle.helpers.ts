import type { Backend } from "@app/cli/backend/backend.types.ts";
import { Docker } from "@app/cli/docker/docker.constants.ts";
import type {
  ComposeOptions,
  ComposeStatusEntry,
} from "@app/cli/docker/docker.types.ts";
import { parseComposeStatus } from "@app/cli/docker/docker.utils.ts";
import { EnvFile } from "@app/cli/env/env.constants.ts";
import { Lifecycle } from "@app/cli/lifecycle/lifecycle.constants.ts";
import {
  LlamaNotHealthyError,
  type RotateKeyError,
  type UninstallError,
} from "@app/cli/lifecycle/lifecycle.types.ts";
import type { CommandFailedError } from "@app/cli/process/process.types.ts";
import { Secrets } from "@app/cli/secret/secret.constants.ts";
import type { StackDependencies } from "@app/cli/stack/stack.interface.ts";
import { Prompt } from "@effect/cli";
import type { PlatformError } from "@effect/platform/Error";
import { Console, Duration, Effect, Option, type Redacted } from "effect";

type HealthError = CommandFailedError | PlatformError;

const serviceEntry = (
  services: readonly ComposeStatusEntry[],
  name: string,
): Option.Option<ComposeStatusEntry> =>
  Option.fromNullable(
    services.find(
      (service: ComposeStatusEntry): boolean => service.service === name,
    ),
  );

/** A service without a healthcheck is judged on its state alone. */
const isEntryHealthy = (entry: ComposeStatusEntry): boolean =>
  entry.health === Docker.states.healthy ||
  (entry.health.length === 0 && entry.state === Docker.states.running);

/**
 * llama.cpp answers for itself; the keep-alive front, when it runs, is the
 * service the clients actually reach, so it has to be healthy too.
 */
const isStackHealthy = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
): Effect.Effect<boolean, HealthError> =>
  dependencies.docker
    .composeCaptured(backend, Docker.verbs.psJson, options)
    .pipe(
      Effect.map((output: string): boolean => {
        const services: readonly ComposeStatusEntry[] =
          parseComposeStatus(output);
        return [Docker.services.llama, Docker.services.heartbeat].every(
          (name: string): boolean =>
            Option.match(serviceEntry(services, name), {
              onNone: (): boolean => name === Docker.services.heartbeat,
              onSome: isEntryHealthy,
            }),
        );
      }),
    );

/** Polls until the restarted stack answers again, or gives up. */
const waitLlamaHealthy = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
  attempts: number = Lifecycle.poll.attempts,
  delayMs: number = Lifecycle.poll.delayMs,
): Effect.Effect<void, HealthError | LlamaNotHealthyError> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (yield* isStackHealthy(dependencies, backend, options)) return;
      yield* Effect.sleep(Duration.millis(delayMs));
    }
    return yield* new LlamaNotHealthyError({ backend });
  });

/**
 * llama.cpp reads its key once, at startup, so writing the file is only half
 * the rotation: the server keeps honouring the old key until it restarts, and
 * only serves the new one once it has loaded the model again.
 */
const rotateApiKey = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
): Effect.Effect<void, RotateKeyError> =>
  Effect.gen(function* () {
    const key: Redacted.Redacted<string> =
      yield* dependencies.secrets.rotateApiKey;
    yield* Console.log(Lifecycle.messages.rotated);
    yield* Console.log(
      Lifecycle.messages.rotatedFingerprint(
        dependencies.secrets.fingerprint(key),
      ),
    );
    yield* Console.log(Lifecycle.messages.restartingLlama);
    yield* dependencies.docker.compose(
      backend,
      Docker.verbs.restart(
        options.keepalive === true
          ? [Docker.services.llama, Docker.services.heartbeat]
          : [Docker.services.llama],
      ),
      options,
    );
    yield* waitLlamaHealthy(dependencies, backend, options);
    yield* Console.log(Lifecycle.messages.rotatedClients);
  });

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
    yield* Console.log(Lifecycle.messages.stopped);
    const purge: boolean = yield* Prompt.run(
      Prompt.confirm({
        initial: false,
        message: Lifecycle.messages.purgePrompt,
      }),
    );
    if (!purge) return;
    yield* removeQuietly(dependencies, EnvFile.path, false);
    yield* removeQuietly(dependencies, Secrets.directory, true);
    yield* Console.log(Lifecycle.messages.purged);
  });

export { rotateApiKey, uninstall, waitLlamaHealthy };
