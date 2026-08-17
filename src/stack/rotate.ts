import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type { StackDependencies } from "@app/stack/stack.interface.ts";
import { LlamaNotHealthyError } from "@app/stack/stack.types.ts";
import type { ComposeStatusEntry } from "@app/stack/stack.utils.ts";
import { parseComposeStatus } from "@app/stack/stack.utils.ts";
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
 * The heartbeat container is the one that reports on llama.cpp: the llama
 * images do not all ship the HTTP client a container healthcheck needs. A
 * custom Compose file may drop it, so llama.cpp itself is the fallback.
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
        return Option.match(serviceEntry(services, Docker.services.heartbeat), {
          onNone: (): boolean =>
            Option.match(serviceEntry(services, Docker.services.llama), {
              onNone: (): boolean => false,
              onSome: isEntryHealthy,
            }),
          onSome: isEntryHealthy,
        });
      }),
    );

/** Polls until the heartbeat reports a healthy llama.cpp, or gives up. */
const waitLlamaHealthy = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
  attempts: number = Stack.poll.attempts,
  delayMs: number = Stack.poll.delayMs,
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
 * only reports the new one once it has loaded the model again.
 */
const rotateApiKey = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
): Effect.Effect<void, HealthError | LlamaNotHealthyError> =>
  Effect.gen(function* () {
    const key: Redacted.Redacted<string> =
      yield* dependencies.secrets.rotateApiKey;
    yield* Console.log(Stack.messages.rotated);
    yield* Console.log(
      Stack.messages.rotatedFingerprint(dependencies.secrets.fingerprint(key)),
    );
    yield* Console.log(Stack.messages.restartingLlama);
    yield* dependencies.docker.compose(
      backend,
      Docker.verbs.restartLlama,
      options,
    );
    yield* waitLlamaHealthy(dependencies, backend, options);
    yield* Console.log(Stack.messages.rotatedClients);
  });

export { rotateApiKey, waitLlamaHealthy };
