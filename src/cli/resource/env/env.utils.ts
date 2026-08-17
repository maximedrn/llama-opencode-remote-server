import { ClientFile, EnvFile } from "@app/cli/resource/env/env.constants.ts";
import type { ClientEnv, StackEnv } from "@app/cli/resource/env/env.types.ts";
import { Config, Option } from "effect";

const optionalString = (name: string): Config.Config<Option.Option<string>> =>
  Config.option(Config.string(name));

const isFilled = (value: string): boolean => value.trim().length > 0;

/**
 * `KEY=""` means absent, not empty: both example files ship keys blank, and an
 * empty value would otherwise reach Compose or the smoke test as a real one.
 */
const cleanStackEnv = (env: StackEnv): StackEnv => ({
  backend: Option.filter(env.backend, isFilled),
  composeFile: Option.filter(env.composeFile, isFilled),
  keepalive: Option.filter(env.keepalive, isFilled),
  localPort: Option.filter(env.localPort, isFilled),
  modelAlias: Option.filter(env.modelAlias, isFilled),
  modelDirectory: Option.filter(env.modelDirectory, isFilled),
  modelFile: Option.filter(env.modelFile, isFilled),
});

const cleanClientEnv = (env: ClientEnv): ClientEnv => ({
  accessClientId: Option.filter(env.accessClientId, isFilled),
  accessClientSecret: Option.filter(env.accessClientSecret, isFilled),
  apiKey: Option.filter(env.apiKey, isFilled),
  baseUrl: Option.filter(env.baseUrl, isFilled),
});

/** Everything `.env` may hold, described once as a single `Config`. */
const stackEnvConfig: Config.Config<StackEnv> = Config.all({
  backend: optionalString(EnvFile.keys.backend),
  composeFile: optionalString(EnvFile.keys.composeFile),
  keepalive: optionalString(EnvFile.keys.keepalive),
  localPort: optionalString(EnvFile.keys.localPort),
  modelAlias: optionalString(EnvFile.keys.modelAlias),
  modelDirectory: optionalString(EnvFile.keys.modelDirectory),
  modelFile: optionalString(EnvFile.keys.modelFile),
}).pipe(Config.map(cleanStackEnv));

const clientEnvConfig: Config.Config<ClientEnv> = Config.all({
  accessClientId: optionalString(ClientFile.keys.accessClientId),
  accessClientSecret: optionalString(ClientFile.keys.accessClientSecret),
  apiKey: optionalString(ClientFile.keys.apiKey),
  baseUrl: optionalString(ClientFile.keys.baseUrl),
}).pipe(Config.map(cleanClientEnv));

const missingKeys = (env: StackEnv): readonly string[] =>
  [
    Option.isNone(env.modelDirectory) ? EnvFile.keys.modelDirectory : "",
    Option.isNone(env.modelFile) ? EnvFile.keys.modelFile : "",
  ].filter(isFilled);

export {
  cleanClientEnv,
  cleanStackEnv,
  clientEnvConfig,
  isFilled,
  missingKeys,
  optionalString,
  stackEnvConfig,
};
