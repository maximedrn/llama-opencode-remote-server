import { Commands } from "@app/cli/command/command.constants.ts";
import type {
  DoctorConfig,
  EmptyConfig,
  LifecycleDefinition,
  LogsConfig,
  StackCommandError,
  StackSubcommandConfig,
  StackTargetConfig,
  StatusConfig,
} from "@app/cli/command/command.types.ts";
import {
  clientOption,
  describeModel,
  initOptions,
  jsonOption,
  reportDoctor,
  reportStatus,
  serviceOption,
  targetOptions,
  withTarget,
} from "@app/cli/command/command.utils.ts";
import type { SmokeTestError } from "@app/cli/operation/client/client.interface.ts";
import type { DoctorFailedError } from "@app/cli/operation/doctor/doctor.types.ts";
import type {
  RotateKeyError,
  UninstallError,
} from "@app/cli/operation/lifecycle/lifecycle.types.ts";
import { Stack } from "@app/cli/operation/stack/stack.constants.ts";
import type {
  InitError,
  LifecycleError,
  ListModelsError,
  PreflightError,
} from "@app/cli/operation/stack/stack.interface.ts";
import { StackService } from "@app/cli/operation/stack/stack.service.ts";
import type { InitInput } from "@app/cli/operation/stack/stack.types.ts";
import { Backends } from "@app/cli/resource/backend/backend.constants.ts";
import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import { Docker } from "@app/cli/resource/docker/docker.constants.ts";
import { DockerService } from "@app/cli/resource/docker/docker.service.ts";
import type { ComposeOptions } from "@app/cli/resource/docker/docker.types.ts";
import type { ModelListing } from "@app/cli/resource/model/model.types.ts";
import type { Prompt } from "@effect/cli";
import { Command } from "@effect/cli";
import { Console, Effect, Option } from "effect";

const initCommand: Command.Command<
  "init",
  Prompt.Prompt.Environment | StackService,
  InitError,
  InitInput
> = Command.make("init", initOptions, (input: InitInput) =>
  Effect.flatMap(StackService, (stack: StackService) => stack.init(input)),
).pipe(Command.withDescription(Commands.descriptions.init));

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
).pipe(Command.withDescription(Commands.descriptions.preflight));

const makeLifecycleCommand = <Name extends string>(
  lifecycle: LifecycleDefinition<Name>,
): Command.Command<
  Name,
  DockerService | StackService,
  LifecycleError,
  StackTargetConfig
> =>
  Command.make(lifecycle.name, targetOptions, (config: StackTargetConfig) =>
    Effect.gen(function* () {
      const docker: DockerService = yield* DockerService;
      yield* docker.assertAvailable;
      yield* withTarget(config, (backend: Backend, options: ComposeOptions) =>
        docker.compose(backend, lifecycle.args, options),
      );
    }),
  ).pipe(Command.withDescription(lifecycle.description));

const statusCommand: Command.Command<
  "status",
  DockerService | StackService,
  LifecycleError,
  StatusConfig
> = Command.make(
  "status",
  { ...targetOptions, json: jsonOption },
  (config: StatusConfig) =>
    Effect.gen(function* () {
      const docker: DockerService = yield* DockerService;
      yield* docker.assertAvailable;
      yield* withTarget(config, (backend: Backend, options: ComposeOptions) =>
        docker
          .composeCaptured(backend, Docker.verbs.psJson, options)
          .pipe(
            Effect.flatMap(
              (output: string): Effect.Effect<void> =>
                config.json ? Console.log(output.trim()) : reportStatus(output),
            ),
          ),
      );
    }),
).pipe(Command.withDescription(Commands.descriptions.status));

const logsCommand: Command.Command<
  "logs",
  DockerService | StackService,
  LifecycleError,
  LogsConfig
> = Command.make(
  "logs",
  { ...targetOptions, service: serviceOption },
  (config: LogsConfig) =>
    Effect.gen(function* () {
      const docker: DockerService = yield* DockerService;
      yield* docker.assertAvailable;
      yield* withTarget(config, (backend: Backend, options: ComposeOptions) =>
        docker.compose(backend, Docker.verbs.logs(config.service), options),
      );
    }),
).pipe(Command.withDescription(Commands.descriptions.logs));

const testCommand: Command.Command<
  "test",
  StackService,
  SmokeTestError,
  EmptyConfig
> = Command.make("test", {}, () =>
  Effect.flatMap(StackService, (stack: StackService) => stack.test),
).pipe(Command.withDescription(Commands.descriptions.test));

const healthCommand: Command.Command<
  "health",
  StackService,
  SmokeTestError,
  EmptyConfig
> = Command.make("health", {}, () =>
  Effect.flatMap(StackService, (stack: StackService) => stack.health),
).pipe(Command.withDescription(Commands.descriptions.health));

const modelsCommand: Command.Command<
  "models",
  StackService,
  ListModelsError,
  EmptyConfig
> = Command.make("models", {}, () =>
  Effect.gen(function* () {
    const stack: StackService = yield* StackService;
    const models: readonly ModelListing[] = yield* stack.models;
    if (models.length === 0) {
      return yield* Console.log(Commands.output.noModels);
    }
    yield* Effect.forEach(
      models,
      (model: ModelListing): Effect.Effect<void> =>
        Console.log(describeModel(model)),
      { discard: true },
    );
  }),
).pipe(Command.withDescription(Commands.descriptions.models));

/**
 * Doctor resolves its target leniently: an unusable backend or an unreadable
 * `.env` is one of the things it is meant to report, not a reason to stop
 * before printing anything.
 */
const doctorCommand: Command.Command<
  "doctor",
  StackService,
  DoctorFailedError,
  DoctorConfig
> = Command.make(
  "doctor",
  { ...targetOptions, client: clientOption, json: jsonOption },
  (config: DoctorConfig) =>
    Effect.gen(function* () {
      const stack: StackService = yield* StackService;
      const backend: Backend = yield* stack
        .resolveBackend(config.backend)
        .pipe(
          Effect.orElseSucceed(
            (): Backend =>
              Option.getOrElse(
                config.backend,
                (): Backend => Backends.fallback,
              ),
          ),
        );
      const options: ComposeOptions = yield* stack
        .composeOptions(config.local, config.keepalive, config.composeFile)
        .pipe(
          Effect.orElseSucceed((): ComposeOptions => ({ local: config.local })),
        );
      yield* reportDoctor(
        yield* stack.doctor(backend, options, config.client),
        config.json,
      );
    }),
).pipe(Command.withDescription(Commands.descriptions.doctor));

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
).pipe(Command.withDescription(Commands.descriptions.rotateKey));

const uninstallCommand: Command.Command<
  "uninstall",
  Prompt.Prompt.Environment | StackService,
  LifecycleError | UninstallError,
  StackTargetConfig
> = Command.make("uninstall", targetOptions, (config: StackTargetConfig) =>
  withTarget(config, (backend: Backend, options: ComposeOptions) =>
    Effect.flatMap(StackService, (stack: StackService) =>
      stack.uninstall(backend, options),
    ),
  ),
).pipe(Command.withDescription(Commands.descriptions.uninstall));

const stackCommand: Command.Command<
  "stack",
  DockerService | Prompt.Prompt.Environment | StackService,
  StackCommandError,
  { readonly subcommand: Option.Option<StackSubcommandConfig> }
> = Command.make(Stack.cli.name).pipe(
  Command.withDescription(Stack.cli.description),
  Command.withSubcommands([
    initCommand,
    preflightCommand,
    ...Commands.lifecycle.map(makeLifecycleCommand),
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
