import type { SmokeTestError } from "@app/cli/operation/client/client.interface.ts";
import type { DoctorFailedError } from "@app/cli/operation/doctor/doctor.types.ts";
import type {
  RotateKeyError,
  UninstallError,
} from "@app/cli/operation/lifecycle/lifecycle.types.ts";
import type {
  InitError,
  LifecycleError,
  ListModelsError,
  PreflightError,
} from "@app/cli/operation/stack/stack.interface.ts";
import type { InitInput } from "@app/cli/operation/stack/stack.types.ts";
import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import type { Options } from "@effect/cli";
import type { Option } from "effect";

/** Shared by preflight, status, logs and every lifecycle command. */
type StackTargetConfig = {
  readonly backend: Option.Option<Backend>;
  readonly composeFile: Option.Option<string>;
  readonly keepalive: Option.Option<boolean>;
  readonly local: boolean;
};

type TargetOptions = {
  readonly backend: Options.Options<Option.Option<Backend>>;
  readonly composeFile: Options.Options<Option.Option<string>>;
  readonly keepalive: Options.Options<Option.Option<boolean>>;
  readonly local: Options.Options<boolean>;
};

/** Commands that take neither options nor arguments. */
type EmptyConfig = Record<string, never>;

type StatusConfig = StackTargetConfig & { readonly json: boolean };

type LogsConfig = StackTargetConfig & { readonly service: string };

type DoctorConfig = StackTargetConfig & {
  readonly client: boolean;
  readonly json: boolean;
};

type LifecycleDefinition<Name extends string> = {
  readonly args: readonly string[];
  readonly description: string;
  readonly name: Name;
};

/** Parsed value of whichever subcommand ran. */
type StackSubcommandConfig =
  | DoctorConfig
  | EmptyConfig
  | InitInput
  | LogsConfig
  | StackTargetConfig
  | StatusConfig;

/** Every failure any subcommand can raise. */
type StackCommandError =
  | DoctorFailedError
  | InitError
  | LifecycleError
  | ListModelsError
  | PreflightError
  | RotateKeyError
  | SmokeTestError
  | UninstallError;

export type {
  DoctorConfig,
  EmptyConfig,
  LifecycleDefinition,
  LogsConfig,
  StackCommandError,
  StackSubcommandConfig,
  StackTargetConfig,
  StatusConfig,
  TargetOptions,
};
