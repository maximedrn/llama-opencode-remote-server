# syntax=docker/dockerfile:1.19

# The llama.cpp images cannot be trusted to carry an HTTP client, so the
# liveness signal comes from this tiny binary instead: it polls the server and
# logs every transition, and `heartbeat check` is the container healthcheck.
FROM oven/bun:1.3.14-alpine AS build

WORKDIR /workspace

COPY package.json bun.lock tsconfig.json build.ts ./

# --ignore-scripts: the prepare hook installs lefthook, a devDependency that is
# absent from a production install and useless without a git directory.
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
  bun install --frozen-lockfile --production --ignore-scripts

COPY src ./src

RUN bun run build:heartbeat

FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates libgcc libstdc++ \
  && addgroup -S heartbeat \
  && adduser -S -G heartbeat heartbeat

WORKDIR /app

COPY --from=build --chown=heartbeat:heartbeat /workspace/dist/heartbeat /app/heartbeat

USER heartbeat

ENTRYPOINT ["/app/heartbeat"]
