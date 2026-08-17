import { Commands } from "@app/cli/command/command.constants.ts";
import type {
  StackTargetConfig,
  TargetOptions,
} from "@app/cli/command/command.types.ts";
import {
  DoctorFailedError,
  type DoctorResult,
} from "@app/cli/operation/doctor/doctor.types.ts";
import type { LifecycleError } from "@app/cli/operation/stack/stack.interface.ts";
import { StackService } from "@app/cli/operation/stack/stack.service.ts";
import { Backends } from "@app/cli/resource/backend/backend.constants.ts";
import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import { Docker } from "@app/cli/resource/docker/docker.constants.ts";
import type {
  ComposeOptions,
  ComposeStatusEntry,
} from "@app/cli/resource/docker/docker.types.ts";
import { parseComposeStatus } from "@app/cli/resource/docker/docker.utils.ts";
import type { ModelListing } from "@app/cli/resource/model/model.types.ts";
import { Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";

const localOption: Options.Options<boolean> = Options.boolean(
  Commands.options.local,
).pipe(Options.withDescription(Commands.descriptions.local));

const jsonOption: Options.Options<boolean> = Options.boolean(
  Commands.options.json,
).pipe(Options.withDescription(Commands.descriptions.json));

const clientOption: Options.Options<boolean> = Options.boolean(
  Commands.options.client,
).pipe(Options.withDescription(Commands.descriptions.client));

const serviceOption: Options.Options<string> = Options.choice(
  Commands.options.service,
  [
    Docker.services.llama,
    Docker.services.heartbeat,
    Docker.services.proxy,
    Docker.services.cloudflared,
  ],
).pipe(
  Options.withDefault(Docker.services.llama),
  Options.withDescription(Commands.descriptions.service),
);

/**
 * Three states, two flags: `--keepalive` forces the front on, `--no-keepalive`
 * forces it off, and neither leaves the decision to KEEPALIVE in `.env`. A
 * lone boolean flag cannot express the third state — it reads as `false` when
 * absent, which silently overrode the file.
 */
const keepaliveChoice = (on: boolean, off: boolean): Option.Option<boolean> => {
  if (on) return Option.some(true);
  return off ? Option.some(false) : Option.none();
};

const keepaliveOption: Options.Options<Option.Option<boolean>> = Options.all({
  off: Options.boolean(Commands.options.noKeepalive).pipe(
    Options.withDescription(Commands.descriptions.noKeepalive),
  ),
  on: Options.boolean(Commands.options.keepalive).pipe(
    Options.withDescription(Commands.descriptions.keepalive),
  ),
}).pipe(
  Options.map(
    (flags: {
      readonly off: boolean;
      readonly on: boolean;
    }): Option.Option<boolean> => keepaliveChoice(flags.on, flags.off),
  ),
);

const targetOptions: TargetOptions = {
  backend: Options.choice(Commands.options.backend, Backends.list).pipe(
    Options.withDescription(Commands.descriptions.backend),
    Options.optional,
  ),
  composeFile: Options.text(Commands.options.composeFile).pipe(
    Options.withDescription(Commands.descriptions.composeFile),
    Options.optional,
  ),
  keepalive: keepaliveOption,
  local: localOption,
};

const initOptions: {
  readonly backend: Options.Options<Backend>;
  readonly force: Options.Options<boolean>;
  readonly include: Options.Options<Option.Option<string>>;
  readonly keepalive: Options.Options<boolean>;
  readonly local: Options.Options<boolean>;
  readonly modelDirectory: Options.Options<Option.Option<string>>;
  readonly modelFile: Options.Options<Option.Option<string>>;
  readonly modelUrl: Options.Options<Option.Option<string>>;
  readonly repository: Options.Options<Option.Option<string>>;
} = {
  backend: Options.choice(Commands.options.backend, Backends.list).pipe(
    Options.withDefault<Backend>(Backends.fallback),
    Options.withDescription(Commands.descriptions.backend),
  ),
  force: Options.boolean(Commands.options.force).pipe(
    Options.withDescription(Commands.descriptions.force),
  ),
  include: Options.text(Commands.options.hfInclude).pipe(
    Options.withDescription(Commands.descriptions.hfInclude),
    Options.optional,
  ),
  keepalive: Options.boolean(Commands.options.keepalive).pipe(
    Options.withDescription(Commands.descriptions.keepalive),
  ),
  local: localOption,
  modelDirectory: Options.text(Commands.options.modelDirectory).pipe(
    Options.withDescription(Commands.descriptions.modelDir),
    Options.optional,
  ),
  modelFile: Options.text(Commands.options.modelFile).pipe(
    Options.withDescription(Commands.descriptions.modelFile),
    Options.optional,
  ),
  modelUrl: Options.text(Commands.options.modelUrl).pipe(
    Options.withDescription(Commands.descriptions.modelUrl),
    Options.optional,
  ),
  repository: Options.text(Commands.options.hfRepository).pipe(
    Options.withDescription(Commands.descriptions.hfRepo),
    Options.optional,
  ),
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
      config.keepalive,
      config.composeFile,
    );
    yield* use(backend, options);
  });

/** `docker compose ps` output as a tab-separated table. */
const reportStatus = (output: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const services: readonly ComposeStatusEntry[] = parseComposeStatus(output);
    if (services.length === 0) {
      return yield* Console.log(Commands.output.noServices);
    }
    yield* Effect.forEach(
      services,
      (service: ComposeStatusEntry): Effect.Effect<void> =>
        Console.log(
          [service.service, service.state, service.health]
            .join(Commands.output.tab)
            .trimEnd(),
        ),
      { discard: true },
    );
  });

const describeResult = (result: DoctorResult): string => {
  const detail: string = Option.getOrElse(result.detail, (): string => "");
  const fix: string = Option.match(result.fix, {
    onNone: (): string => "",
    onSome: (value: string): string =>
      `${Commands.output.fixPrefix}${value}${Commands.output.fixSuffix}`,
  });
  return result.ok
    ? `${Commands.output.okPrefix}${result.label}`
    : `${Commands.output.failPrefix}${result.label}${Commands.output.separator}${detail}${fix}`;
};

const describeModel = (model: ModelListing): string =>
  Option.match(model.size, {
    onNone: (): string => model.name,
    onSome: (size: number): string =>
      [
        model.name,
        `${(size / Commands.output.bytesPerGibibyte).toFixed(2)}${Commands.output.sizeUnit}`,
      ].join(Commands.output.tab),
  });

const reportDoctor = (
  results: readonly DoctorResult[],
  json: boolean,
): Effect.Effect<void, DoctorFailedError> =>
  Effect.gen(function* () {
    yield* json
      ? Console.log(JSON.stringify(results, null, Commands.output.jsonIndent))
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

export {
  clientOption,
  describeModel,
  describeResult,
  initOptions,
  jsonOption,
  keepaliveChoice,
  localOption,
  reportDoctor,
  reportStatus,
  serviceOption,
  targetOptions,
  withTarget,
};
