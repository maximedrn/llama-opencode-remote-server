import { Backends } from "@app/cli/backend/backend.constants.ts";
import type {
  Backend,
  UnsupportedBackendError,
} from "@app/cli/backend/backend.types.ts";
import type { ComposeOptions } from "@app/cli/docker/docker.types.ts";
import type { EnvReadError, StackEnv } from "@app/cli/env/env.types.ts";
import type {
  BackendResolutionError,
  StackDependencies,
} from "@app/cli/stack/stack.interface.ts";
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

/** Command flags win over what `init` remembered in `.env`. */
const makeComposeOptions = (
  dependencies: StackDependencies,
  local: boolean,
  keepalive: Option.Option<boolean>,
  llamaFile: Option.Option<string>,
): Effect.Effect<ComposeOptions, EnvReadError | PlatformError> =>
  dependencies.env.read.pipe(
    Effect.map(
      (env: StackEnv): ComposeOptions => ({
        keepalive: Option.getOrElse(keepalive, (): boolean =>
          Option.isSome(env.keepalive),
        ),
        llamaFile: Option.getOrUndefined(
          Option.orElse(
            llamaFile,
            (): Option.Option<string> => env.composeFile,
          ),
        ),
        local,
      }),
    ),
  );

export { makeComposeOptions, resolveBackend };
