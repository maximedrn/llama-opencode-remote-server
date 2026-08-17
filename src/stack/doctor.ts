import { Backends } from "@app/backend/backend.constants.ts";
import type { Backend } from "@app/backend/backend.types.ts";
import { Docker } from "@app/docker/docker.constants.ts";
import type { ComposeOptions } from "@app/docker/docker.types.ts";
import type { ModelLocation } from "@app/env/env.types.ts";
import { ModelFileMissingError } from "@app/model/model.types.ts";
import { Secrets } from "@app/secret/secret.constants.ts";
import { smokeTest } from "@app/stack/client.ts";
import type {
  DoctorCheckError,
  StackDependencies,
} from "@app/stack/stack.interface.ts";
import type { DoctorResult } from "@app/stack/stack.types.ts";
import { Effect, Either, Option } from "effect";

interface DoctorCheck {
  readonly fix: string;
  readonly label: string;
  readonly run: Effect.Effect<void, DoctorCheckError>;
}

/** Labels double as the identifiers `--json` consumers match on. */
const Checks = {
  compose: "Compose files",
  devices: "GPU devices",
  docker: "Docker daemon",
  host: "Host compatibility",
  model: "Model file",
  reachable: "Llama reachable",
  secrets: "Secrets",
} as const;

const Fixes = {
  compose: "Fix .env or the Compose files, then run doctor again.",
  devices: "Grant the container access to /dev/kfd and /dev/dri.",
  docker: "Install Docker or start the daemon, then run doctor again.",
  host: `Pick a compatible backend: bun run stack init --backend ${Backends.fallback}`,
  model: "Run init again, or copy the model into MODEL_DIRECTORY.",
  reachable:
    "Start the stack (bun run stack up), then check clients/client.env.",
  secrets: "Run init again to recreate the secrets.",
} as const;

const modelCheck = (
  dependencies: StackDependencies,
): Effect.Effect<void, DoctorCheckError> =>
  Effect.gen(function* () {
    const location: ModelLocation = yield* dependencies.env.requireModel;
    const modelPath: string = dependencies.path.resolve(
      location.directory,
      location.file,
    );
    if (!(yield* dependencies.fileSystem.exists(modelPath))) {
      return yield* new ModelFileMissingError({ path: modelPath });
    }
  });

const hostChecks = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
): readonly DoctorCheck[] => [
  {
    fix: Fixes.docker,
    label: Checks.docker,
    run: dependencies.docker.assertAvailable,
  },
  {
    fix: Fixes.compose,
    label: Checks.compose,
    run: dependencies.docker.compose(backend, Docker.verbs.config, options),
  },
  {
    fix: Fixes.host,
    label: Checks.host,
    run: dependencies.backends.assertHost(backend),
  },
  {
    fix: Fixes.devices,
    label: Checks.devices,
    run: dependencies.backends.assertDevices(backend),
  },
  {
    fix: Fixes.model,
    label: Checks.model,
    run: modelCheck(dependencies),
  },
  {
    fix: Fixes.secrets,
    label: Checks.secrets,
    run: dependencies.secrets.assertPresent(
      options.local === true
        ? [Secrets.files.apiKey]
        : [Secrets.files.apiKey, Secrets.files.tunnelToken],
    ),
  },
];

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const runCheck = (check: DoctorCheck): Effect.Effect<DoctorResult> =>
  check.run.pipe(
    Effect.either,
    Effect.map(
      (outcome: Either.Either<void, DoctorCheckError>): DoctorResult =>
        Either.isLeft(outcome)
          ? {
              detail: Option.some(describeCause(outcome.left)),
              fix: Option.some(check.fix),
              label: check.label,
              ok: false,
            }
          : {
              detail: Option.none(),
              fix: Option.none(),
              label: check.label,
              ok: true,
            },
    ),
  );

/**
 * Every check is run, and every failure is absorbed into its own line: a
 * doctor that stops at the first problem hides the other five. On a client
 * host only the reachability check applies — there is no Docker, no model and
 * no secret there to look at.
 */
const doctor = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
  client: boolean,
): Effect.Effect<readonly DoctorResult[]> =>
  Effect.forEach(
    [
      ...(client ? [] : hostChecks(dependencies, backend, options)),
      {
        fix: Fixes.reachable,
        label: Checks.reachable,
        run: smokeTest(dependencies),
      },
    ],
    runCheck,
  );

export { doctor };
