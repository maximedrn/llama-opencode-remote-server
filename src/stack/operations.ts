import type { Backend } from "@app/backend/backend.types.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import {
  clientOption,
  jsonOption,
  type StackTargetConfig,
  targetOptions,
  withTarget,
} from "@app/stack/commands.ts";
import { Stack } from "@app/stack/stack.constants.ts";
import type {
  LifecycleError,
  ListModelsError,
  SmokeTestError,
  UninstallError,
} from "@app/stack/stack.interface.ts";
import { StackService } from "@app/stack/stack.service.ts";
import type { DoctorResult, ModelListing } from "@app/stack/stack.types.ts";
import { DoctorFailedError } from "@app/stack/stack.types.ts";
import type { Prompt } from "@effect/cli";
import { Command } from "@effect/cli";
import { Console, Effect, Option } from "effect";

interface DoctorConfig extends StackTargetConfig {
  readonly client: boolean;
  readonly json: boolean;
}

/** Commands that take neither options nor arguments. */
type EmptyConfig = Record<string, never>;

const bytesPerGibibyte: number = 1024 ** 3;

const describeResult = (result: DoctorResult): string => {
  const detail: string = Option.getOrElse(result.detail, (): string => "");
  const fix: string = Option.match(result.fix, {
    onNone: (): string => "",
    onSome: (value: string): string => `  [fix: ${value}]`,
  });
  return result.ok
    ? `OK    ${result.label}`
    : `FAIL  ${result.label}  --  ${detail}${fix}`;
};

const reportDoctor = (
  results: readonly DoctorResult[],
  json: boolean,
): Effect.Effect<void, DoctorFailedError> =>
  Effect.gen(function* () {
    yield* json
      ? Console.log(JSON.stringify(results, null, 2))
      : Effect.forEach(
          results,
          (result: DoctorResult): Effect.Effect<void> =>
            Console.log(describeResult(result)),
          { discard: true },
        );
    const failures: readonly DoctorResult[] = results.filter(
      (result: DoctorResult): boolean => !result.ok,
    );
    if (failures.length === 0) return;
    return yield* new DoctorFailedError({
      failures: failures.map((result: DoctorResult): string => result.label),
    });
  });

const doctorCommand: Command.Command<
  "doctor",
  StackService,
  DoctorFailedError | LifecycleError,
  DoctorConfig
> = Command.make(
  "doctor",
  { ...targetOptions, client: clientOption, json: jsonOption },
  (config: DoctorConfig) =>
    config.client
      ? Effect.flatMap(
          StackService,
          (stack: StackService): Effect.Effect<void, DoctorFailedError> =>
            stack
              .doctor("cpu", { local: config.local }, true)
              .pipe(
                Effect.flatMap((results: readonly DoctorResult[]) =>
                  reportDoctor(results, config.json),
                ),
              ),
        )
      : withTarget(config, (backend: Backend, options: ComposeOptions) =>
          Effect.gen(function* () {
            const stack: StackService = yield* StackService;
            const results: readonly DoctorResult[] = yield* stack.doctor(
              backend,
              options,
              false,
            );
            yield* reportDoctor(results, config.json);
          }),
        ),
).pipe(Command.withDescription(Stack.descriptions.doctor));

const healthCommand: Command.Command<
  "health",
  StackService,
  SmokeTestError,
  EmptyConfig
> = Command.make("health", {}, () =>
  Effect.flatMap(
    StackService,
    (stack: StackService): Effect.Effect<void, SmokeTestError> => stack.health,
  ),
).pipe(Command.withDescription(Stack.descriptions.health));

const describeModel = (model: ModelListing): string =>
  Option.match(model.size, {
    onNone: (): string => model.name,
    onSome: (size: number): string =>
      `${model.name}\t${(size / bytesPerGibibyte).toFixed(2)} GiB`,
  });

const modelsCommand: Command.Command<
  "models",
  StackService,
  ListModelsError,
  EmptyConfig
> = Command.make("models", {}, () =>
  Effect.gen(function* () {
    const stack: StackService = yield* StackService;
    const models: readonly ModelListing[] = yield* stack.models;
    if (models.length === 0) return yield* Console.log(Stack.messages.noModels);
    yield* Effect.forEach(
      models,
      (model: ModelListing): Effect.Effect<void> =>
        Console.log(describeModel(model)),
      { discard: true },
    );
  }),
).pipe(Command.withDescription(Stack.descriptions.models));

const uninstallCommand: Command.Command<
  "uninstall",
  Prompt.Prompt.Environment | StackService,
  LifecycleError | UninstallError,
  StackTargetConfig
> = Command.make("uninstall", targetOptions, (config: StackTargetConfig) =>
  withTarget(config, (backend: Backend, options: ComposeOptions) =>
    Effect.flatMap(
      StackService,
      (
        stack: StackService,
      ): Effect.Effect<void, UninstallError, Prompt.Prompt.Environment> =>
        stack.uninstall(backend, options),
    ),
  ),
).pipe(Command.withDescription(Stack.descriptions.uninstall));

export { doctorCommand, healthCommand, modelsCommand, uninstallCommand };
