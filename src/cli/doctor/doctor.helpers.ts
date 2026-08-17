import type { Backend } from "@app/cli/backend/backend.types.ts";
import { smokeTest } from "@app/cli/client/client.helpers.ts";
import { Docker } from "@app/cli/docker/docker.constants.ts";
import type { ComposeOptions } from "@app/cli/docker/docker.types.ts";
import { Doctor } from "@app/cli/doctor/doctor.constants.ts";
import type {
  DoctorCheckError,
  DoctorResult,
} from "@app/cli/doctor/doctor.types.ts";
import type { ModelLocation } from "@app/cli/env/env.types.ts";
import { ModelFileMissingError } from "@app/cli/model/model.types.ts";
import { Secrets } from "@app/cli/secret/secret.constants.ts";
import type { StackDependencies } from "@app/cli/stack/stack.interface.ts";
import { Effect, Either, Option } from "effect";

interface DoctorCheck {
  readonly fix: string;
  readonly label: string;
  readonly run: Effect.Effect<void, DoctorCheckError>;
}

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

/** The checks a server host has, and a client host has no business running. */
const hostChecks = (
  dependencies: StackDependencies,
  backend: Backend,
  options: ComposeOptions,
): readonly DoctorCheck[] => [
  {
    fix: Doctor.fixes.docker,
    label: Doctor.checks.docker,
    run: dependencies.docker.assertAvailable,
  },
  {
    fix: Doctor.fixes.compose,
    label: Doctor.checks.compose,
    run: dependencies.docker.compose(backend, Docker.verbs.config, options),
  },
  {
    fix: Doctor.fixes.host,
    label: Doctor.checks.host,
    run: dependencies.backends.assertHost(backend),
  },
  {
    fix: Doctor.fixes.devices,
    label: Doctor.checks.devices,
    run: dependencies.backends.assertDevices(backend),
  },
  {
    fix: Doctor.fixes.model,
    label: Doctor.checks.model,
    run: modelCheck(dependencies),
  },
  {
    fix: Doctor.fixes.secrets,
    label: Doctor.checks.secrets,
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
 * Every check runs, and every failure is absorbed into its own line: a doctor
 * that stops at the first problem hides the other five. On a client host only
 * reachability applies — there is no Docker, no model and no secret to look at.
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
        fix: Doctor.fixes.reachable,
        label: Doctor.checks.reachable,
        run: smokeTest(dependencies),
      },
    ],
    runCheck,
  );

export { doctor };
