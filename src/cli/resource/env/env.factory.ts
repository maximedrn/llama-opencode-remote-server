import type { Backend } from "@app/cli/resource/backend/backend.types.ts";
import { EnvFile } from "@app/cli/resource/env/env.constants.ts";
import type { EnvRecord } from "@app/cli/resource/env/env.types.ts";
import type { ResolvedModel } from "@app/cli/resource/model/model.types.ts";
import { modelAlias } from "@app/cli/resource/model/model.utils.ts";
import type { HostThreads } from "@app/cli/system/host/host.interface.ts";

interface StackEnvInput {
  readonly backend: Backend;
  /** What `.env` already holds; anything tuned by hand is kept as it is. */
  readonly existing: EnvRecord;
  /** Written so every later command layers the keep-alive Compose file. */
  readonly keepalive: boolean;
  readonly model: ResolvedModel;
  readonly threads: HostThreads;
}

/**
 * Builds the `.env` Compose reads, with the thread counts measured on the host.
 *
 * Three layers, in order: the shipped defaults, then whatever the operator
 * already tuned in `.env`, then the handful of variables `init` owns. A second
 * `init` therefore keeps a pinned `LLAMA_IMAGE`, a raised `CTX_SIZE` or a
 * custom `LOCAL_PORT` — losing them silently sent the stack back to the image
 * built for the backend, which is not what anyone asked for.
 *
 * Image tags stay out of the owned set: each Compose file already defaults to
 * the build made for its accelerator, and `LLAMA_IMAGE` overrides all three.
 */
const makeStackEnv = (input: StackEnvInput): EnvRecord => ({
  ...Object.fromEntries(EnvFile.runtime),
  ...input.existing,
  [EnvFile.keys.backend]: input.backend,
  [EnvFile.keys.keepalive]: input.keepalive ? EnvFile.enabled : "",
  [EnvFile.keys.modelAlias]: modelAlias(input.model.file),
  [EnvFile.keys.batchThreads]: String(input.threads.batch),
  [EnvFile.keys.generationThreads]: String(input.threads.generation),
  [EnvFile.keys.modelDirectory]: input.model.directory,
  [EnvFile.keys.modelFile]: input.model.file,
});

export { makeStackEnv };
