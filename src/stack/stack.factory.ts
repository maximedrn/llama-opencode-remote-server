import { Backends } from "@app/backend/backend.constants.ts";
import type {
  Backend,
  IncompatibleHostError,
  UnsupportedBackendError,
} from "@app/backend/backend.types.ts";
import { DockerService } from "@app/docker/docker.service.ts";
import type { DockerUnavailableError } from "@app/docker/docker.types.ts";
import type { EnvNotInitializedError } from "@app/env/env.types.ts";
import type { ModelFileMissingError } from "@app/model/model.types.ts";
import type { CommandFailedError } from "@app/process/process.types.ts";
import type { MissingSecretError } from "@app/secret/secret.types.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type {
  BackendResolutionError,
  InitError,
  PreflightError,
  SmokeTestError,
} from "@app/stack/stack.interface.ts";
import { StackService } from "@app/stack/stack.service.ts";
import type { InitInput } from "@app/stack/stack.types.ts";
import { Command, Options } from "@effect/cli";
import type { Prompt } from "@effect/cli/Prompt";
import type {
  BadArgument,
  PlatformError,
  SystemError,
} from "@effect/platform/Error";
import { Effect, Option } from "effect";

/** Shared by preflight and every lifecycle command. */
interface StackTargetConfig {
  readonly backend: Option.Option<Backend>;
  readonly local: boolean;
}

/** Commands that take neither options nor arguments. */
type EmptyConfig = Record<string, never>;

/** Parsed value of whichever subcommand ran. */
type StackSubcommandConfig = EmptyConfig | InitInput | StackTargetConfig;

interface StackCommandConfig {
  readonly subcommand: Option.Option<StackSubcommandConfig>;
}

type InitOptions = {
  readonly backend: Options.Options<Backend>;
  readonly include: Options.Options<Option.Option<string>>;
  readonly local: Options.Options<boolean>;
  readonly modelDirectory: Options.Options<Option.Option<string>>;
  readonly modelFile: Options.Options<Option.Option<string>>;
  readonly modelUrl: Options.Options<Option.Option<string>>;
  readonly repository: Options.Options<Option.Option<string>>;
};

interface LifecycleDefinition<Name extends string> {
  readonly args: readonly string[];
  readonly description: string;
  readonly name: Name;
}

type LifecycleError =
  | BackendResolutionError
  | CommandFailedError
  | DockerUnavailableError
  | PlatformError;

const localOption: Options.Options<boolean> = Options.boolean("local").pipe(
  Options.withDescription(Stack.descriptions.local),
);

const backendOption: Options.Options<Option.Option<Backend>> = Options.choice(
  "backend",
  Backends.list,
).pipe(Options.withDescription(Stack.descriptions.backend), Options.optional);

const initOptions: InitOptions = {
  backend: Options.choice("backend", Backends.list).pipe(
    Options.withDefault<Backend>(Backends.fallback),
    Options.withDescription(Stack.descriptions.backend),
  ),
  include: Options.text("hf-include").pipe(
    Options.withDescription(Stack.descriptions.hfInclude),
    Options.optional,
  ),
  local: localOption,
  modelDirectory: Options.text("model-directory").pipe(
    Options.withDescription(Stack.descriptions.modelDir),
    Options.optional,
  ),
  modelFile: Options.text("model-file").pipe(
    Options.withDescription(Stack.descriptions.modelFile),
    Options.optional,
  ),
  modelUrl: Options.text("model-url").pipe(
    Options.withDescription(Stack.descriptions.modelUrl),
    Options.optional,
  ),
  repository: Options.text("hf-repository").pipe(
    Options.withDescription(Stack.descriptions.hfRepo),
    Options.optional,
  ),
};

const withBackend = <E>(
  requested: Option.Option<Backend>,
  use: (backend: Backend) => Effect.Effect<void, E>,
): Effect.Effect<void, BackendResolutionError | E, StackService> =>
  Effect.gen(function* () {
    const stack: StackService = yield* StackService;
    yield* use(yield* stack.resolveBackend(requested));
  });

const makeLifecycleCommand = <Name extends string>(
  lifecycle: LifecycleDefinition<Name>,
): Command.Command<
  Name,
  DockerService | StackService,
  LifecycleError,
  StackTargetConfig
> =>
  Command.make(
    lifecycle.name,
    { backend: backendOption, local: localOption },
    (config: StackTargetConfig) =>
      Effect.gen(function* () {
        const docker: DockerService = yield* DockerService;
        yield* docker.assertAvailable;
        yield* withBackend(config.backend, (target: Backend) =>
          docker.compose(target, lifecycle.args, { local: config.local }),
        );
      }),
  ).pipe(Command.withDescription(lifecycle.description));

const initCommand: Command.Command<
  "init",
  StackService | Prompt.Environment,
  InitError,
  InitInput
> = Command.make("init", initOptions, (input: InitInput) =>
  Effect.flatMap(StackService, (stack: StackService) => stack.init(input)),
).pipe(Command.withDescription(Stack.descriptions.init));

const preflightCommand: Command.Command<
  "preflight",
  StackService,
  | IncompatibleHostError
  | BadArgument
  | SystemError
  | UnsupportedBackendError
  | MissingSecretError
  | EnvNotInitializedError
  | CommandFailedError
  | ModelFileMissingError,
  StackTargetConfig
> = Command.make(
  "preflight",
  { backend: backendOption, local: localOption },
  (config: StackTargetConfig) =>
    Effect.gen(function* () {
      const stack: StackService = yield* StackService;
      yield* withBackend(config.backend, (target: Backend) =>
        stack.preflight(target, config.local),
      );
    }),
).pipe(Command.withDescription(Stack.descriptions.preflight));

const testCommand: Command.Command<
  "test",
  StackService,
  SmokeTestError,
  EmptyConfig
> = Command.make("test", {}, () =>
  Effect.flatMap(StackService, (stack: StackService) => stack.test),
).pipe(Command.withDescription(Stack.descriptions.test));

const rotateKeyCommand: Command.Command<
  "rotate-key",
  StackService,
  LifecycleError,
  StackTargetConfig
> = Command.make(
  "rotate-key",
  { backend: backendOption, local: localOption },
  (config: StackTargetConfig) =>
    Effect.flatMap(StackService, (stack: StackService) =>
      withBackend(config.backend, (target: Backend) =>
        stack.rotateKey(target, config.local),
      ),
    ),
).pipe(Command.withDescription(Stack.descriptions.rotateKey));

/** Every failure any subcommand can raise. */
type StackCommandError =
  | InitError
  | LifecycleError
  | PreflightError
  | SmokeTestError;

const stackCommand: Command.Command<
  "stack",
  DockerService | Prompt.Environment | StackService,
  StackCommandError,
  StackCommandConfig
> = Command.make(Stack.cli.name).pipe(
  Command.withDescription(Stack.cli.description),
  Command.withSubcommands([
    initCommand,
    preflightCommand,
    ...Stack.lifecycle.map(makeLifecycleCommand),
    testCommand,
    rotateKeyCommand,
  ]),
);

export { type StackCommandError, stackCommand };
