/** Model acquisition vocabulary; the project ships no default model. */
const Model = {
  /** Directory segments appended to the home directory when none is given. */
  defaultDirectorySegments: [".llama", "models"],
  extension: ".gguf",
  huggingFace: {
    cli: "hf",
    downloadArgs: ["download"],
    includeFlag: "--include",
    localDirectoryFlag: "--local-dir",
    /** Cheap probe telling whether the CLI is installed. */
    probeArgs: ["version"],
  },
  messages: {
    cliMissing:
      "The Hugging Face CLI (`hf`) is required for --hf-repository. " +
      'Install it with `pip install -U "huggingface_hub[cli]"`, or pass ' +
      "--model-file or --model-url instead.",
    downloadFailed: (url: string, reason: string): string =>
      `Download of ${url} failed: ${reason}`,
    downloadingRepository: (
      repository: string,
      pattern: string,
      directory: string,
    ): string =>
      `Downloading ${repository} (${pattern}) into ${directory} with \`hf\`...`,
    downloadingUrl: (url: string, target: string): string =>
      `Downloading ${url} into ${target}...`,
    fileMissing: (path: string): string => `Model file not found: ${path}.`,
    notFound: (directory: string, pattern: string): string =>
      `No file matching ${pattern} found in ${directory}.`,
    sourceRequired:
      "Pass exactly one model source: --model-file, --model-url or " +
      "--hf-repository.",
  },
  /** Everything matching the pattern; shard `00001` sorts first. */
  searchPattern: (pattern: string): string => `**/${pattern}`,
} as const;

export { Model };
