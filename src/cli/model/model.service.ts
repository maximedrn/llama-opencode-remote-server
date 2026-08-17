import { resolveModel } from "@app/cli/model/model.helpers.ts";
import type {
  ModelApi,
  ModelResolutionError,
} from "@app/cli/model/model.interface.ts";
import type {
  ModelRequest,
  ResolvedModel,
} from "@app/cli/model/model.types.ts";
import type { ProcessApi } from "@app/cli/process/process.interface.ts";
import { ProcessService } from "@app/cli/process/process.service.ts";
import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";

class ModelService extends Effect.Service<ModelService>()("ModelService", {
  dependencies: [ProcessService.Default],
  effect: Effect.gen(function* () {
    const processes: ProcessApi = yield* ProcessService;
    const path: Path.Path = yield* Path.Path;
    const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;

    const api: ModelApi = {
      resolve: (
        request: ModelRequest,
      ): Effect.Effect<ResolvedModel, ModelResolutionError> =>
        resolveModel({ fileSystem, path, processes }, request),
    };
    return api;
  }),
}) {}

export { ModelService };
