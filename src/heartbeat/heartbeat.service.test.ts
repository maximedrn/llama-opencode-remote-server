import { describe, expect, test } from "bun:test";
import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { probe, serve } from "@app/heartbeat/heartbeat.service.ts";
import type {
  HeartbeatConfig,
  ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import type { Server } from "bun";
import { Duration, Effect, Fiber, Option, Schedule } from "effect";

const keepAliveMs: number = 50;
const token: string = 'data: {"token":"OK"}\n\n';

/** A llama.cpp that thinks for a while before writing its first token. */
const silentUpstream = (silenceMs: number): Server<unknown> =>
  Bun.serve({
    fetch: (request: Request): Response =>
      new URL(request.url).pathname === Heartbeat.paths.health
        ? Response.json({ status: "ok" })
        : new Response(
            new ReadableStream<Uint8Array>({
              start: (
                controller: ReadableStreamDefaultController<Uint8Array>,
              ): void => {
                setTimeout((): void => {
                  controller.enqueue(new TextEncoder().encode(token));
                  controller.close();
                }, silenceMs);
              },
            }),
            { headers: { "content-type": Heartbeat.streamContentType } },
          ),
    port: 0,
  });

const configFor = (upstreamPort: number, port: number): HeartbeatConfig => ({
  apiKey: Option.none(),
  keepAliveMs,
  port,
  probeTimeoutMs: 1000,
  upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
});

/** Bun types the bound port as optional; a started server always has one. */
const portOf = (server: Server<unknown>): number => server.port ?? 0;

const frontUrl = (config: HeartbeatConfig, path: string): string =>
  `http://127.0.0.1:${config.port}${path}`;

/** The forked server binds a tick later; any answer means it is listening. */
const waitReady = (config: HeartbeatConfig): Effect.Effect<void> =>
  Effect.tryPromise(
    (): Promise<Response> => fetch(frontUrl(config, Heartbeat.paths.health)),
  ).pipe(
    Effect.retry(
      Schedule.spaced(Duration.millis(20)).pipe(
        Schedule.compose(Schedule.recurs(100)),
      ),
    ),
    Effect.asVoid,
    Effect.orDie,
  );

const withFront = <A>(
  config: HeartbeatConfig,
  use: () => Promise<A>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const front: Fiber.RuntimeFiber<never> = yield* Effect.fork(
        serve(config),
      );
      yield* waitReady(config);
      const result: A = yield* Effect.promise(use);
      yield* Fiber.interrupt(front);
      return result;
    }),
  );

const fetchText =
  (url: string, options?: RequestInit): (() => Promise<string>) =>
  async (): Promise<string> => {
    const response: Response = await fetch(url, options);
    return await response.text();
  };

describe("keep-alive front", () => {
  test("fills a silent stream with SSE comments, then the real tokens", async () => {
    const upstream: Server<unknown> = silentUpstream(keepAliveMs * 4);
    const config: HeartbeatConfig = configFor(portOf(upstream), 49_961);
    const body: string = await withFront(
      config,
      fetchText(frontUrl(config, "/v1/chat/completions"), {
        body: JSON.stringify({ stream: true }),
        method: "POST",
      }),
    );
    await upstream.stop(true);
    expect(body).toContain(Heartbeat.keepAliveComment);
    expect(body.endsWith(token)).toBe(true);
  });

  test("relays a plain JSON answer untouched", async () => {
    const upstream: Server<unknown> = silentUpstream(0);
    const config: HeartbeatConfig = configFor(portOf(upstream), 49_962);
    const answer: string = await withFront(
      config,
      fetchText(frontUrl(config, Heartbeat.paths.health)),
    );
    await upstream.stop(true);
    expect(answer).toBe(JSON.stringify({ status: "ok" }));
  });

  test("probing through the front reports llama.cpp as healthy", async () => {
    const upstream: Server<unknown> = silentUpstream(0);
    const config: HeartbeatConfig = configFor(portOf(upstream), 49_963);
    const result: ProbeResult = await withFront(
      config,
      (): Promise<ProbeResult> =>
        Effect.runPromise(
          probe(config, frontUrl(config, Heartbeat.paths.health)),
        ),
    );
    await upstream.stop(true);
    expect(result.ok).toBe(true);
  });

  test("a dead llama.cpp answers a bad gateway", async () => {
    const upstream: Server<unknown> = silentUpstream(0);
    const upstreamPort: number = portOf(upstream);
    await upstream.stop(true);
    const config: HeartbeatConfig = configFor(upstreamPort, 49_964);
    const status: number = await withFront(
      config,
      async (): Promise<number> => {
        const response: Response = await fetch(
          frontUrl(config, Heartbeat.paths.health),
        );
        return response.status;
      },
    );
    expect(status).toBe(Heartbeat.upstreamStatus.badGateway);
  });
});
