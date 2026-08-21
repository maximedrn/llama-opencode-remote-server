# syntax=docker/dockerfile:1.19

# The optional keep-alive front: it relays every request to llama.cpp and holds
# the connection open while llama.cpp is silent. `heartbeat check` probes
# llama.cpp through it, which is what the container healthcheck runs.
FROM oven/bun:1.3.14-alpine AS build

WORKDIR /workspace

COPY package.json bun.lock tsconfig.json ./

# --ignore-scripts: the prepare hook installs lefthook, a devDependency that is
# absent from a production install and useless without a git directory.
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
  bun install --frozen-lockfile --production --ignore-scripts

# The build script lives with the app it compiles, under src/heartbeat.
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
