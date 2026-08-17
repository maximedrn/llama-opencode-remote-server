import type { Backend } from "@app/cli/backend/backend.types.ts";
import { Docker } from "@app/cli/docker/docker.constants.ts";
import type {
  ComposeOptions,
  ComposeStatusEntry,
} from "@app/cli/docker/docker.types.ts";
import { Project } from "@app/cli/project/project.constants.ts";
import { Option } from "effect";

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

const readString = (record: Record<string, unknown>, key: string): string => {
  const value: unknown = record[key];
  return typeof value === "string" ? value : "";
};

const toStatusEntry = (entry: unknown): readonly ComposeStatusEntry[] => {
  if (typeof entry !== "object" || Option.isNone(Option.fromNullable(entry))) {
    return [];
  }
  const record: Record<string, unknown> = entry as Record<string, unknown>;
  const service: string = readString(record, Docker.psFields.service);
  return service.length === 0
    ? []
    : [
        {
          health: readString(record, Docker.psFields.health),
          service,
          state: readString(record, Docker.psFields.state),
        },
      ];
};

const parseJson = (text: string): Option.Option<unknown> =>
  Option.liftThrowable((value: string): unknown => JSON.parse(value))(text);

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
