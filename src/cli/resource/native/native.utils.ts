import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import type { EnvRecord } from "@app/cli/resource/env/env.types.ts";
import { Native } from "@app/cli/resource/native/native.constants.ts";
import type {
  NativeConfig,
  NativeState,
} from "@app/cli/resource/native/native.types.ts";
import { NativeError } from "@app/cli/resource/native/native.types.ts";
import { Option, Schema } from "effect";

const stateSchema = Schema.parseJson(
  Schema.Struct({
    pid: Schema.Int.pipe(Schema.positive()),
    serverPath: Schema.NonEmptyString,
  }),
);

const pathSeparator = /[\\/]/;
const lineBreak = /\r?\n/;

/** A corrupted state file must never identify a process to terminate. */
const decodeState = (json: string): Option.Option<NativeState> =>
  Schema.decodeUnknownOption(stateSchema)(json);

const positiveInteger = (value: string, name: string): number => {
  const parsed: number = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new NativeError({
      reason: Native.messages.invalidConfiguration(name),
    });
  }
  return parsed;
};

const optionalArg = (
  flag: string,
  value: string | undefined,
): readonly string[] => (value ? [flag, value] : []);

const modelArgs = (values: EnvRecord, context: number): readonly string[] => {
  const fitTarget: string | undefined = values[EnvFile.keys.fitTarget];
  const draftTokens: string | undefined = values[EnvFile.keys.draftTokens];
  return [
    ...optionalArg("--batch-size", values[EnvFile.keys.batchSize]),
    ...optionalArg("--ubatch-size", values[EnvFile.keys.ubatchSize]),
    ...optionalArg("--threads", values[EnvFile.keys.generationThreads]),
    ...optionalArg("--threads-batch", values[EnvFile.keys.batchThreads]),
    ...optionalArg("--load-mode", values[EnvFile.keys.loadMode]),
    ...(fitTarget
      ? ["--fit", "on", "--fit-target", fitTarget, "--fit-ctx", String(context)]
      : []),
    ...(draftTokens && draftTokens !== "0"
      ? [
          "--spec-type",
          "ngram-simple",
          "--spec-ngram-simple-size-m",
          draftTokens,
        ]
      : []),
  ];
};

/** Explicit argv: no shell expansion and no string command concatenation. */
const serverArgs = (
  config: NativeConfig,
  apiKeyPath: string,
): readonly string[] => [
  "--device",
  config.device,
  "--split-mode",
  "none",
  "-m",
  config.modelPath,
  "--alias",
  config.alias,
  "--host",
  "127.0.0.1",
  "--port",
  String(config.port),
  "--ctx-size",
  String(config.context),
  "--parallel",
  "1",
  "--flash-attn",
  config.flashAttention,
  "--cache-type-k",
  config.cacheK,
  "--cache-type-v",
  config.cacheV,
  ...config.modelArgs,
  "--jinja",
  "--cache-prompt",
  "--no-mmproj",
  "--no-ui",
  "--metrics",
  "--api-key-file",
  apiKeyPath,
];

/** `tasklist /FO CSV /NH` returns image name, PID, session, and memory. */
const matchesProcess = (output: string, state: NativeState): boolean => {
  const executable: string = state.serverPath.split(pathSeparator).at(-1) ?? "";
  const prefix: string = `"${executable}","${state.pid}",`.toLowerCase();
  return output
    .split(lineBreak)
    .some((line: string): boolean =>
      line.trim().toLowerCase().startsWith(prefix),
    );
};

export { decodeState, matchesProcess, modelArgs, positiveInteger, serverArgs };
