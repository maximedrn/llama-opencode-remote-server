import type { Backend } from "@app/backend/backend.types.ts";
import { EnvFile } from "@app/env/env.constants.ts";
import type { EnvRecord } from "@app/env/env.types.ts";
import type { HostThreads } from "@app/host/host.interface.ts";
import type { ResolvedModel } from "@app/model/model.types.ts";
import { modelAlias } from "@app/model/model.utils.ts";

interface StackEnvInput {
  readonly backend: Backend;
  readonly model: ResolvedModel;
  readonly threads: HostThreads;
}

/**
 * Builds the `.env` Compose reads, with the thread counts measured on the host.
 * Image tags are left to the Compose files: each one already defaults to the
 * build made for its accelerator, and `LLAMA_IMAGE` overrides all three.
 */
const makeStackEnv = (input: StackEnvInput): EnvRecord => ({
  ...Object.fromEntries(EnvFile.runtime),
  [EnvFile.keys.backend]: input.backend,
  [EnvFile.keys.modelAlias]: modelAlias(input.model.file),
  [EnvFile.keys.batchThreads]: String(input.threads.batch),
  [EnvFile.keys.generationThreads]: String(input.threads.generation),
  [EnvFile.keys.modelDirectory]: input.model.directory,
  [EnvFile.keys.modelFile]: input.model.file,
});

export { makeStackEnv };
