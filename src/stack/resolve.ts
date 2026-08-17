import { Backends } from "@app/backend/backend.constants.ts";
import type {
  Backend,
  UnsupportedBackendError,
} from "@app/backend/backend.types.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import type { EnvReadError, StackEnv } from "@app/env/env.types.ts";
import type {
  BackendResolutionError,
  StackDependencies,
} from "@app/stack/stack.interface.ts";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Option } from "effect";

/** `--backend` wins, then the backend remembered in `.env`, then cpu. */
const resolveBackend = (
  dependencies: StackDependencies,
  requested: Option.Option<Backend>,
): Effect.Effect<Backend, BackendResolutionError> =>
  Option.match(requested, {
    onNone: (): Effect.Effect<Backend, BackendResolutionError> =>
      dependencies.env.read.pipe(
        Effect.flatMap(
          (env: StackEnv): Effect.Effect<Backend, UnsupportedBackendError> =>
            dependencies.backends.parse(
              Option.getOrElse(env.backend, (): string => Backends.fallback),
            ),
        ),
      ),
    onSome: (backend: Backend): Effect.Effect<Backend> =>
      Effect.succeed(backend),
  }).pipe(Effect.tap(dependencies.backends.assertHost));

/** `--compose-file` wins over COMPOSE_OVERRIDE_FILE in `.env`. */
const resolveComposeOptions = (
  dependencies: StackDependencies,
  local: boolean,
  overrideFile: Option.Option<string>,
): Effect.Effect<ComposeOptions, EnvReadError | PlatformError> =>
  dependencies.env.read.pipe(
    Effect.map(
      (env: StackEnv): ComposeOptions => ({
        local,
        overrideFile: Option.getOrUndefined(
          Option.orElse(
            overrideFile,
            (): Option.Option<string> => env.composeFile,
          ),
        ),
      }),
    ),
  );

export { resolveBackend, resolveComposeOptions };
