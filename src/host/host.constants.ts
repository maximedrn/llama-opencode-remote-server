/** Host facts the stack has to branch on, kept out of the domain services. */
const Host = {
  homeFallback: ".",
  /** Home directory variables, in lookup order, read through `Config`. */
  homeVariable: "HOME",
  homeVariableWindows: "USERPROFILE",
  minimumThreads: 1,
  platforms: {
    linux: "linux",
    macos: "darwin",
    windows: "win32",
  },
  /** Half of the logical cores go to generation, all of them to batch work. */
  threadDivisor: 2,
} as const;

export { Host };
