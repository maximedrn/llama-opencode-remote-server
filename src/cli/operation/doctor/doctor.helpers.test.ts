import { describe, expect, test } from "bun:test";
import { MissingClientConfigError } from "@app/cli/operation/client/client.types.ts";
import { doctor } from "@app/cli/operation/doctor/doctor.helpers.ts";
import type { DoctorResult } from "@app/cli/operation/doctor/doctor.types.ts";
import type { StackDependencies } from "@app/cli/operation/stack/stack.interface.ts";
import { IncompatibleHostError } from "@app/cli/resource/backend/backend.types.ts";
import { DockerUnavailableError } from "@app/cli/resource/docker/docker.types.ts";
import { EnvNotInitializedError } from "@app/cli/resource/env/env.types.ts";
import { MissingSecretError } from "@app/cli/resource/secret/secret.types.ts";
import { Effect, Option } from "effect";

/** Nothing works on this host: every check has something to report. */
const brokenDependencies: StackDependencies = {
  backends: {
    assertDevices: (): Effect.Effect<void, IncompatibleHostError> =>
      Effect.fail(new IncompatibleHostError({ reason: "no /dev/kfd" })),
    assertHost: (): Effect.Effect<void, IncompatibleHostError> =>
      Effect.fail(new IncompatibleHostError({ reason: "wrong platform" })),
  },
  docker: {
    assertAvailable: Effect.fail(
      new DockerUnavailableError({ reason: "no daemon" }),
    ),
    compose: (): Effect.Effect<void, DockerUnavailableError> =>
      Effect.fail(new DockerUnavailableError({ reason: "no daemon" })),
  },
  env: {
    read: Effect.succeed({}),
    readClient: Effect.fail(
      new MissingClientConfigError({ variable: "LLAMA_BASE_URL" }),
    ),
    requireModel: Effect.fail(
      new EnvNotInitializedError({ missing: "MODEL_DIRECTORY" }),
    ),
  },
  secrets: {
    assertPresent: (): Effect.Effect<void, MissingSecretError> =>
      Effect.fail(new MissingSecretError({ name: ".llama_api_key" })),
  },
} as unknown as StackDependencies;

const labels = (results: readonly DoctorResult[]): readonly string[] =>
  results.map((result: DoctorResult): string => result.label);

describe("doctor", () => {
  test("reports every failing check instead of stopping at the first", async () => {
    const results: readonly DoctorResult[] = await Effect.runPromise(
      doctor(brokenDependencies, "cpu", { local: false }, false),
    );
    expect(labels(results)).toEqual([
      "Docker daemon",
      "Compose files",
      "Host compatibility",
      "GPU devices",
      "Model file",
      "Secrets",
      "Llama reachable",
    ]);
    expect(results.every((result: DoctorResult): boolean => !result.ok)).toBe(
      true,
    );
    expect(
      results.every((result: DoctorResult): boolean =>
        Option.isSome(result.fix),
      ),
    ).toBe(true);
  });

  test("a client host is only checked for reachability", async () => {
    const results: readonly DoctorResult[] = await Effect.runPromise(
      doctor(brokenDependencies, "cpu", { local: false }, true),
    );
    expect(labels(results)).toEqual(["Llama reachable"]);
    const detail: Option.Option<string> = Option.flatMap(
      Option.fromNullable(results[0]),
      (result: DoctorResult): Option.Option<string> => result.detail,
    );
    expect(Option.getOrElse(detail, (): string => "")).toContain(
      "LLAMA_BASE_URL",
    );
  });
});
