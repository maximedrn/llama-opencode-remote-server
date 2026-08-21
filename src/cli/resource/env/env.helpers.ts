import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import type { EnvRecord } from "@app/cli/resource/env/env.types.ts";
import { EnvReadError } from "@app/cli/resource/env/env.types.ts";
import { FileSystem, PlatformConfigProvider } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { Config } from "effect";
import { ConfigProvider, Effect } from "effect";
import { parse } from "envfile";

/** An absent file is not an error: the caller decides what it needs. */
const provider = (
  fileSystem: FileSystem.FileSystem,
  path: string,
): Effect.Effect<ConfigProvider.ConfigProvider, PlatformError> =>
  fileSystem
    .exists(path)
    .pipe(
      Effect.flatMap(
        (
          exists: boolean,
        ): Effect.Effect<ConfigProvider.ConfigProvider, PlatformError> =>
          exists
            ? PlatformConfigProvider.fromDotEnv(path).pipe(
                Effect.provideService(FileSystem.FileSystem, fileSystem),
              )
            : Effect.succeed(ConfigProvider.fromMap(new Map())),
      ),
    );

/** Reads one dotenv file through a `Config`, reporting a parse failure. */
const readFile = <A>(
  fileSystem: FileSystem.FileSystem,
  path: string,
  config: Config.Config<A>,
): Effect.Effect<A, EnvReadError | PlatformError> =>
  provider(fileSystem, path).pipe(
    Effect.flatMap(
      (source: ConfigProvider.ConfigProvider): Effect.Effect<A, EnvReadError> =>
        Effect.withConfigProvider(config, source).pipe(
          Effect.mapError(
            (cause: unknown): EnvReadError =>
              new EnvReadError({ file: path, reason: String(cause) }),
          ),
        ),
    ),
  );

/** Everything `.env` holds today, so `init` can keep what it does not own. */
const readRawFile = (
  fileSystem: FileSystem.FileSystem,
): Effect.Effect<EnvRecord, PlatformError> =>
  fileSystem
    .exists(EnvFile.path)
    .pipe(
      Effect.flatMap(
        (exists: boolean): Effect.Effect<EnvRecord, PlatformError> =>
          exists
            ? fileSystem
                .readFileString(EnvFile.path)
                .pipe(
                  Effect.map((content: string): EnvRecord => parse(content)),
                )
            : Effect.succeed({}),
      ),
    );

export { readFile, readRawFile };
