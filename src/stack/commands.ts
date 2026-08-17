import { Backends } from "@app/backend/backend.constants.ts";
import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import { DockerService } from "@app/docker/docker.service.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type { LifecycleError } from "@app/stack/stack.interface.ts";
import { StackService } from "@app/stack/stack.service.ts";
import type { ComposeStatusEntry } from "@app/stack/stack.utils.ts";
import { parseComposeStatus } from "@app/stack/stack.utils.ts";
import { Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";

/** Shared by preflight, status, logs and every lifecycle command. */
interface StackTargetConfig {
  readonly backend: Option.Option<Backend>;
  readonly composeFile: Option.Option<string>;
  readonly local: boolean;
}

interface StatusConfig extends StackTargetConfig {
  readonly json: boolean;
}

interface LogsConfig extends StackTargetConfig {
  readonly service: string;
}

interface LifecycleDefinition<Name extends string> {
  readonly args: readonly string[];
  readonly description: string;
  readonly name: Name;
}

const localOption: Options.Options<boolean> = Options.boolean("local").pipe(
  Options.withDescription(Stack.descriptions.local),
);

const backendOption: Options.Options<Option.Option<Backend>> = Options.choice(
  "backend",
  Backends.list,
).pipe(Options.withDescription(Stack.descriptions.backend), Options.optional);

const composeFileOption: Options.Options<Option.Option<string>> = Options.text(
  "compose-file",
).pipe(
  Options.withDescription(Stack.descriptions.composeFile),
  Options.optional,
);

const jsonOption: Options.Options<boolean> = Options.boolean("json").pipe(
  Options.withDescription(Stack.descriptions.json),
);

const clientOption: Options.Options<boolean> = Options.boolean("client").pipe(
  Options.withDescription(Stack.descriptions.client),
);

const targetOptions: {
  readonly backend: Options.Options<Option.Option<Backend>>;
  readonly composeFile: Options.Options<Option.Option<string>>;
  readonly local: Options.Options<boolean>;
} = {
  backend: backendOption,
  composeFile: composeFileOption,
  local: localOption,
};

/** Resolves the backend and the Compose layering both, once per command. */
const withTarget = <E, R>(
  config: StackTargetConfig,
  use: (backend: Backend, options: ComposeOptions) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E | LifecycleError, R | StackService> =>
  Effect.gen(function* () {
    const stack: StackService = yield* StackService;
    const backend: Backend = yield* stack.resolveBackend(config.backend);
    const options: ComposeOptions = yield* stack.composeOptions(
      config.local,
      config.composeFile,
    );
    yield* use(backend, options);
  });

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

const reportStatus = (output: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const services: readonly ComposeStatusEntry[] = parseComposeStatus(output);
    if (services.length === 0) {
      return yield* Console.log(Stack.messages.noServices);
    }
    yield* Effect.forEach(
      services,
      (service: ComposeStatusEntry): Effect.Effect<void> =>
        Console.log(
          `${service.service}\t${service.state}\t${service.health}`.trimEnd(),
        ),
      { discard: true },
    );
  });

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
).pipe(Command.withDescription(Stack.descriptions.status));

const serviceOption: Options.Options<string> = Options.choice("service", [
  Docker.services.llama,
  Docker.services.heartbeat,
  Docker.services.proxy,
  Docker.services.cloudflared,
]).pipe(
  Options.withDefault(Docker.services.llama),
  Options.withDescription(Stack.descriptions.service),
);

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
).pipe(Command.withDescription(Stack.descriptions.logs));

export {
  backendOption,
  clientOption,
  composeFileOption,
  jsonOption,
  localOption,
  logsCommand,
  makeLifecycleCommand,
  type StackTargetConfig,
  statusCommand,
  targetOptions,
  withTarget,
};
