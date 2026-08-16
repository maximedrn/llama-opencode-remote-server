# Stack Improvements — Design

## Context

This repository is a TypeScript/Bun CLI (Effect) driving a Docker stack
(nginx proxy + Cloudflare tunnel + llama.cpp) that serves any GGUF model
through an OpenAI-compatible endpoint.

An audit of the current state found:

- Well-structured code: each domain (`backend`, `docker`, `env`, `host`,
  `model`, `process`, `project`, `secret`, `stack`) follows a consistent
  `constants / interface / service / types / utils` pattern with typed
  domain errors.
- Hardened infrastructure: compose services (read-only, dropped caps,
  pids limits), nginx (rate limiting, security headers, method allow-list),
  CI (lint, typecheck, spell, compose validation), lefthook gates.
- **No tests at all** (zero test files in the repository).
- Limited observability: failures surface as generic errors; no
  diagnostics command; no liveness check outside the full-inference `test`.
- Missing operator features: no doctor, no quick health probe, no model
  listing, no uninstall, logs only follow llama.cpp.

## Goals

1. **Reliability & robustness** — typed errors everywhere, diagnosable
   failures, no partial artifacts, no accidental overwrites.
2. **New features** — operator commands: `doctor`, `health`, `models`,
   `uninstall`, `logs --service`, JSON output.
3. **Code quality & DX** — test foundation, type safety, documentation.

## Constraints

- **Backward compatible**: every existing command keeps its name, flags and
  behavior.
- **No heavy dependencies**: stay on Bun + Effect; testing uses Bun's
  built-in test runner (`bun test`) and Effect layers — no new test
  framework.
- **Quick wins first**: work is organized in ascending tiers so value and
  safety arrive early.

## Chosen approach: test-first hardening

A test foundation is laid first, then reliability improvements, then new
features, then polish. Each tier is executable independently and leaves the
repository in a working state.

Rejected alternatives:

- *Feature velocity* — shipping commands first, tests later: fast value but
  no safety net; regressions in the init/download paths would be invisible.
- *Structural overhaul* — deep refactoring before features: overkill for a
  codebase that is already well organized; unnecessary risk to backward
  compatibility.

## Non-goals

- Multi-model / multi-alias serving.
- New compute backends beyond `cpu`, `nvidia`, `amd`.
- Restructuring the existing per-domain architecture.
- CI integration tests that require a real Docker daemon.

## Tier 0 — Test foundation

Bun's built-in runner (`bun test`); no new dependency.

- Add a `test` script to `package.json`.
- Test doubles for the injected Effect services: `ProcessApi`,
  `FileSystem`, `Path`, `HttpClient`.
- Unit coverage of pure and near-pure logic:
  - `composeArgs` in `docker` — profile selection (local vs edge) and the
    file set per backend.
  - `fileNameFromUrl`, `toPosixPath` in `model.utils`.
  - `resolveModel` in `model.helpers` — `LocalFile`, `DownloadUrl` and
    `HuggingFace` branches (fake `ProcessApi`, real FS under a temp dir).
  - `withoutBlanks`, `makeStackEnv` and the `Config` parsing in `env`.
  - `parse`, `assertHost`, `assertDevices` in `backend` with a fake host
    platform.
  - `fingerprint`, `generateApiKey` in `secret.utils`.
  - `makeSmokeTarget` in `stack.utils`.
- Wire the suite into lefthook (`check` and pre-commit) and the CI job.

**Done when**: `bun test` is green and runs in `bun run validate` and CI.

## Tier 1 — Reliability & robustness

- **Typed errors instead of `orDie`**: the config reads in `env.service`
  and the tunnel-token read in `stack.helpers` turn parse failures into
  domain errors (`EnvParseError`, `TunnelTokenReadError`) instead of
  dying.
- **Diagnosable process failures**: `CommandFailedError` carries the tail
  of captured stderr, not just the command line and exit code.
- **Safe model download**: download to a `.part` temporary file, atomic
  rename on success, cleanup on failure — a failed download never leaves a
  corrupt `.gguf` behind.
- **`rotate-key` verifies the restart**: wait until the llama service is
  healthy (retry loop) before reporting success.
- **`init` confirms overwrites**: a `Prompt.confirm` guards overwriting
  existing `secrets/` and `.env`; a `--force` option skips it.
- **`test` command**: HTTP timeout, and distinct error messages for
  "server unreachable", "auth rejected" and "timeout".
- **`status`**: report each service's live/healthy state, not just
  `docker ps`.

**Done when**: every failure is actionable, no partial model files exist
after a failed download, and re-running `init` cannot silently clobber
secrets.

## Tier 2 — New features

- **`stack doctor`**: sequential diagnostics — Docker daemon + compose,
  backend (host compatibility + devices), model path, secrets, tunnel
  token (remote), reachability. Prints OK/FAIL per check with the
  suggested fix.
- **`stack health`**: quick liveness probe plus a minimal completion
  (tiny `max_tokens`) to validate the API key without a full inference.
- **`stack models`**: list `*.gguf` files in the model directory with
  sizes.
- **`stack uninstall`**: `compose down` plus optional removal of
  `secrets/` and `.env`, behind a confirmation.
- **`stack logs --service <llama|proxy|cloudflared>`**: follow the logs of
  the other services (default stays `llama`).
- **`--json` output** for `status` and `doctor`, for scripting.

**Done when**: each new command works in local and remote mode and is
documented in the README.

## Tier 3 — Code quality & DX

- Replace the `as A` cast in `withoutBlanks` (`env.service`) with a proper
  mapped type.
- README troubleshooting/FAQ section covering the new commands and common
  failure modes.
- CI/hooks: ensure the test step runs and cspell knows the new
  identifiers.

**Done when**: the codebase is lint/type/spell/test-clean and the README
covers the new surface.

## Testing strategy

- Unit tests on pure logic and on services exercised through fake
  injected dependencies.
- No Docker-dependent integration tests in CI; compose validation stays in
  the pre-push hook (it needs a daemon).
- Manual matrix per tier: local mode and remote mode.

## Success criteria

- `bun test` green in CI.
- No `Effect.orDie` in error paths.
- No partial model file after a failed download.
- Every new command documented and working in both modes.
