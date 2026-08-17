/**
 * Compiles the heartbeat into a single binary for the host platform: the image
 * builder already runs a musl Bun, so no cross-compilation target is needed.
 * `Bun.build` rejects with an AggregateError on failure, which is exactly the
 * non-zero exit a build step should have.
 */
await Bun.build({
  bytecode: true,
  compile: {
    autoloadBunfig: false,
    autoloadDotenv: false,
    outfile: "dist/heartbeat",
  },
  entrypoints: ["src/heartbeat/heartbeat.main.ts"],
  minify: true,
  target: "bun",
});

export {};
