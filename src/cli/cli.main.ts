import {
  type StackCommandError,
  stackCommand,
} from "@app/cli/command/command.factory.ts";
import { DockerService } from "@app/cli/docker/docker.service.ts";
import { Stack } from "@app/cli/stack/stack.constants.ts";
import { StackService } from "@app/cli/stack/stack.service.ts";
import { Command } from "@effect/cli";
import type { CliApp } from "@effect/cli/CliApp";
import type { Prompt } from "@effect/cli/Prompt";
import type { ValidationError } from "@effect/cli/ValidationError";
import { FetchHttpClient, type HttpClient } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer } from "effect";

const appLayer: Layer.Layer<
  BunContext.BunContext | DockerService | HttpClient.HttpClient | StackService
> = Layer.mergeAll(DockerService.Default, StackService.Default).pipe(
  Layer.provideMerge(Layer.merge(BunContext.layer, FetchHttpClient.layer)),
);

const runCli: (
  args: readonly string[],
) => Effect.Effect<
  void,
  StackCommandError | ValidationError,
  CliApp.Environment | DockerService | Prompt.Environment | StackService
> = Command.run(stackCommand, {
  name: Stack.cli.description,
  version: Stack.cli.version,
});

/** Domain failures are expected outcomes: report them without a stack trace. */
const reportFailure = (error: unknown): Effect.Effect<void> =>
  Console.error(
    Stack.messages.failure(
      error instanceof Error ? error.message : String(error),
    ),
  );

BunRuntime.runMain(
  runCli(Bun.argv).pipe(
    Effect.tapError(reportFailure),
    Effect.provide(appLayer),
  ),
  { disableErrorReporting: true },
);
