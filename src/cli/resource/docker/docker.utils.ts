import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import { Docker } from "@app/cli/resource/docker/docker.constants.ts";
import type {
  ComposeOptions,
  ComposeStatusEntry,
  ComposeStatusFields,
} from "@app/cli/resource/docker/docker.types.ts";
import { composeStatusSchema } from "@app/cli/resource/docker/docker.types.ts";
import { Project } from "@app/cli/system/project/project.constants.ts";
import { Option, Schema } from "effect";

/** A custom file replaces the shipped llama.cpp definition, nothing else. */
const llamaFile = (backend: Backend, options: ComposeOptions): string =>
  Option.getOrElse(Option.fromNullable(options.llamaFile), (): string =>
    Docker.compose.backendFile(backend),
  );

/** The loopback publisher depends on who is in front of llama.cpp. */
const localFile = (options: ComposeOptions): string =>
  options.keepalive === true
    ? Docker.compose.keepaliveLocalFile
    : Docker.compose.localFile;

/**
 * The project directory is pinned to the repository root so the `./nginx` and
 * `./secrets` bind mounts stay resolvable from `docker/`.
 */
const composeArgs = (
  backend: Backend,
  options: ComposeOptions,
): readonly string[] => [
  Docker.compose.subcommand,
  Docker.flags.projectDirectory,
  Project.root,
  ...(options.local === true
    ? []
    : [Docker.flags.profile, Docker.profiles.edge]),
  Docker.flags.file,
  Docker.compose.baseFile,
  Docker.flags.file,
  llamaFile(backend, options),
  ...(options.keepalive === true
    ? [Docker.flags.file, Docker.compose.keepaliveFile]
    : []),
  ...(options.local === true ? [Docker.flags.file, localFile(options)] : []),
];

const decodeStatusEntry: (
  entry: unknown,
) => Option.Option<ComposeStatusFields> =
  Schema.decodeUnknownOption(composeStatusSchema);

const toStatusEntry = (entry: unknown): readonly ComposeStatusEntry[] =>
  Option.match(decodeStatusEntry(entry), {
    onNone: (): readonly ComposeStatusEntry[] => [],
    onSome: (parsed: ComposeStatusFields): readonly ComposeStatusEntry[] => [
      { health: parsed.Health, service: parsed.Service, state: parsed.State },
    ],
  });

const parseJson = Schema.decodeUnknownOption(Schema.parseJson());

/**
 * Compose has shipped both shapes for `ps --format json`: a JSON array, and one
 * object per line. Unreadable output means no container, which is what every
 * caller already treats as "not ready yet".
 */
const parseComposeStatus = (json: string): readonly ComposeStatusEntry[] => {
  const trimmed: string = json.trim();
  if (trimmed.length === 0) return [];
  return Option.match(parseJson(trimmed), {
    onNone: (): readonly ComposeStatusEntry[] =>
      trimmed
        .split("\n")
        .flatMap((line: string): readonly ComposeStatusEntry[] =>
          Option.match(parseJson(line), {
            onNone: (): readonly ComposeStatusEntry[] => [],
            onSome: toStatusEntry,
          }),
        ),
    onSome: (value: unknown): readonly ComposeStatusEntry[] =>
      Array.isArray(value)
        ? value.flatMap(toStatusEntry)
        : toStatusEntry(value),
  });
};

export { composeArgs, parseComposeStatus };
