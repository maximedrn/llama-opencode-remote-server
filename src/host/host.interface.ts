import type { Effect } from "effect";

interface HostThreads {
  /** Threads used for batch work: every logical core. */
  readonly batch: number;
  /** Threads used for generation: half of the logical cores. */
  readonly generation: number;
}

interface HostApi {
  /** Home directory, read from the environment through `Config`. */
  readonly homeDirectory: Effect.Effect<string>;
  readonly isPlatform: (platform: string) => boolean;
  /** `darwin`, `linux`, `win32`, ... */
  readonly platform: string;
  readonly threads: HostThreads;
}

export type { HostApi, HostThreads };
