import {
  type ModelSource,
  ModelSourceError,
} from "@app/cli/resource/model/model.types.ts";
import { Effect, Option } from "effect";

interface ModelSourceInput {
  /** Glob passed to `hf download --include`. */
  readonly include: Option.Option<string>;
  readonly modelFile: Option.Option<string>;
  readonly modelUrl: Option.Option<string>;
  readonly repository: Option.Option<string>;
}

const huggingFaceSource = (
  repository: string,
  include: Option.Option<string>,
): ModelSource => ({
  include: Option.getOrElse(include, (): string => "*"),
  kind: "HuggingFace",
  repository,
});

/** Exactly one source must be given: the project ships no default model. */
const makeModelSource = (
  input: ModelSourceInput,
): Effect.Effect<ModelSource, ModelSourceError> => {
  const sources: readonly ModelSource[] = [
    ...Option.match(input.modelFile, {
      onNone: (): readonly ModelSource[] => [],
      onSome: (path: string): readonly ModelSource[] => [
        { kind: "LocalFile", path },
      ],
    }),
    ...Option.match(input.modelUrl, {
      onNone: (): readonly ModelSource[] => [],
      onSome: (url: string): readonly ModelSource[] => [
        { kind: "DownloadUrl", url },
      ],
    }),
    ...Option.match(input.repository, {
      onNone: (): readonly ModelSource[] => [],
      onSome: (repository: string): readonly ModelSource[] => [
        huggingFaceSource(repository, input.include),
      ],
    }),
  ];
  const only: Option.Option<ModelSource> =
    sources.length === 1 ? Option.fromNullable(sources[0]) : Option.none();
  return Option.match(only, {
    onNone: (): ModelSourceError =>
      new ModelSourceError({ given: sources.length }),
    onSome: (source: ModelSource): Effect.Effect<ModelSource> =>
      Effect.succeed(source),
  });
};

export { makeModelSource };
