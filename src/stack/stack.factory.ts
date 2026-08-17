import { Backends } from "@app/backend/backend.constants.ts";
import type { Backend } from "@app/backend/backend.types.ts";
import { DockerService } from "@app/docker/docker.service.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import {
  localOption,
  logsCommand,
  makeLifecycleCommand,
  type StackTargetConfig,
  statusCommand,
  targetOptions,
  withTarget,
} from "@app/stack/commands.ts";
import {
  doctorCommand,
  healthCommand,
  modelsCommand,
  uninstallCommand,
} from "@app/stack/operations.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type {
  InitError,
  LifecycleError,
  ListModelsError,
  PreflightError,
  RotateKeyError,
  SmokeTestError,
} from "@app/stack/stack.interface.ts";
import { StackService } from "@app/stack/stack.service.ts";
import type { DoctorFailedError, InitInput } from "@app/stack/stack.types.ts";
import type { Prompt } from "@effect/cli";
import { Command, Options } from "@effect/cli";
import { Effect, type Option } from "effect";

/** Commands that take neither options nor arguments. */
type EmptyConfig = Record<string, never>;

/** Parsed value of whichever subcommand ran. */
type StackSubcommandConfig = EmptyConfig | InitInput | StackTargetConfig;

interface StackCommandConfig {
  readonly subcommand: Option.Option<StackSubcommandConfig>;
}

type InitOptions = {
  readonly backend: Options.Options<Backend>;
  readonly force: Options.Options<boolean>;
  readonly include: Options.Options<Option.Option<string>>;
  readonly local: Options.Options<boolean>;
  readonly modelDirectory: Options.Options<Option.Option<string>>;
  readonly modelFile: Options.Options<Option.Option<string>>;
  readonly modelUrl: Options.Options<Option.Option<string>>;
  readonly repository: Options.Options<Option.Option<string>>;
};

const initOptions: InitOptions = {
  backend: Options.choice("backend", Backends.list).pipe(
    Options.withDefault<Backend>(Backends.fallback),
    Options.withDescription(Stack.descriptions.backend),
  ),
  force: Options.boolean("force").pipe(
    Options.withDescription(Stack.descriptions.force),
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

const initCommand: Command.Command<
  "init",
  Prompt.Prompt.Environment | StackService,
  InitError,
  InitInput
> = Command.make("init", initOptions, (input: InitInput) =>
  Effect.flatMap(StackService, (stack: StackService) => stack.init(input)),
).pipe(Command.withDescription(Stack.descriptions.init));

const preflightCommand: Command.Command<
  "preflight",
  StackService,
  LifecycleError | PreflightError,
  StackTargetConfig
> = Command.make("preflight", targetOptions, (config: StackTargetConfig) =>
  withTarget(config, (backend: Backend, options: ComposeOptions) =>
    Effect.flatMap(StackService, (stack: StackService) =>
      stack.preflight(backend, options),
    ),
  ),
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
  LifecycleError | RotateKeyError,
  StackTargetConfig
> = Command.make("rotate-key", targetOptions, (config: StackTargetConfig) =>
  withTarget(config, (backend: Backend, options: ComposeOptions) =>
    Effect.flatMap(StackService, (stack: StackService) =>
      stack.rotateKey(backend, options),
    ),
  ),
).pipe(Command.withDescription(Stack.descriptions.rotateKey));

/** Every failure any subcommand can raise. */
type StackCommandError =
  | DoctorFailedError
  | InitError
  | LifecycleError
  | ListModelsError
  | PreflightError
  | RotateKeyError
  | SmokeTestError;

const stackCommand: Command.Command<
  "stack",
  DockerService | Prompt.Prompt.Environment | StackService,
  StackCommandError,
  StackCommandConfig
> = Command.make(Stack.cli.name).pipe(
  Command.withDescription(Stack.cli.description),
  Command.withSubcommands([
    initCommand,
    preflightCommand,
    ...Stack.lifecycle.map(makeLifecycleCommand),
    statusCommand,
    logsCommand,
    testCommand,
    healthCommand,
    modelsCommand,
    doctorCommand,
    rotateKeyCommand,
    uninstallCommand,
  ]),
);

export { type StackCommandError, stackCommand };
