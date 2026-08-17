import { Secrets } from "@app/cli/resource/secret/secret.constants.ts";
import type { SecretApi } from "@app/cli/resource/secret/secret.interface.ts";
import { MissingSecretError } from "@app/cli/resource/secret/secret.types.ts";
import {
  fingerprint,
  generateApiKey,
} from "@app/cli/resource/secret/secret.utils.ts";
import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Redacted } from "effect";

type Secret = Redacted.Redacted<string>;

class SecretService extends Effect.Service<SecretService>()("SecretService", {
  effect: Effect.gen(function* () {
    const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;
    const path: Path.Path = yield* Path.Path;

    const secretPath = (name: string): string =>
      path.join(Secrets.directory, name);

    const write = (
      name: string,
      value: Secret,
    ): Effect.Effect<void, PlatformError> =>
      fileSystem
        .makeDirectory(Secrets.directory, { recursive: true })
        .pipe(
          Effect.andThen(
            fileSystem.writeFileString(
              secretPath(name),
              `${Redacted.value(value)}\n`,
              { mode: Secrets.mode },
            ),
          ),
        );

    const read = (name: string): Effect.Effect<Secret, PlatformError> =>
      fileSystem
        .readFileString(secretPath(name))
        .pipe(
          Effect.map(
            (content: string): Secret => Redacted.make(content.trim()),
          ),
        );

    const generate: Effect.Effect<Secret> = Effect.sync(
      (): Secret => Redacted.make(generateApiKey()),
    );

    const rotateApiKey: Effect.Effect<Secret, PlatformError> = generate.pipe(
      Effect.tap(
        (key: Secret): Effect.Effect<void, PlatformError> =>
          write(Secrets.files.apiKey, key),
      ),
    );

    const assertFile = (
      name: string,
    ): Effect.Effect<void, MissingSecretError | PlatformError> =>
      fileSystem
        .exists(secretPath(name))
        .pipe(
          Effect.flatMap(
            (exists: boolean): Effect.Effect<void, MissingSecretError> =>
              exists ? Effect.void : new MissingSecretError({ name }),
          ),
        );

    const assertPresent = (
      names: readonly string[],
    ): Effect.Effect<void, MissingSecretError | PlatformError> =>
      Effect.forEach(names, assertFile, { discard: true });

    const api: SecretApi = {
      assertPresent,
      fingerprint: (secret: Secret): string =>
        fingerprint(Redacted.value(secret)),
      generateApiKey: generate,
      read,
      rotateApiKey,
      write,
    };
    return api;
  }),
}) {}

export { SecretService };
