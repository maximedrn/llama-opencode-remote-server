import { describe, expect, test } from "bun:test";
import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import { probe, serve } from "@app/heartbeat/heartbeat.service.ts";
import type {
  HeartbeatConfig,
  ProbeResult,
} from "@app/heartbeat/heartbeat.types.ts";
import {
  upstreamRequest,
  wantsStream,
} from "@app/heartbeat/heartbeat.utils.ts";
import type { Server } from "bun";
import { Duration, Effect, Fiber, Option, Schedule } from "effect";

const keepAliveMs: number = 50;
/** Long enough for the one-second idle timeout of the front to fire. */
const silence: number = 4000;
const token: string = 'data: {"token":"OK"}\n\n';

/** The answer llama.cpp only starts writing once it has thought long enough. */
const lateTokens = (silenceMs: number): ReadableStream<Uint8Array> => {
  let timer: Timer | undefined;
  return new ReadableStream<Uint8Array>({
    // A client that drops the answer cancels the body: nothing may be enqueued
    // afterwards, which is what a real server has to cope with too.
    cancel: (): void => {
      clearTimeout(timer);
    },
    start: (controller: ReadableStreamDefaultController<Uint8Array>): void => {
      timer = setTimeout((): void => {
        controller.enqueue(new TextEncoder().encode(token));
        controller.close();
      }, silenceMs);
    },
  });
};

/** A llama.cpp that thinks for a while before writing its first token. */
const silentUpstream = (silenceMs: number): Server<unknown> =>
  Bun.serve({
    fetch: (request: Request): Response => {
      const path: string = new URL(request.url).pathname;
      if (path === Heartbeat.paths.health)
        return Response.json({ status: "ok" });
      if (path === Heartbeat.paths.props) {
        // biome-ignore lint/style/useNamingConvention: llama.cpp wire format.
        return Response.json({ build_info: "b0000-test" });
      }
      return new Response(lateTokens(silenceMs), {
        headers: { "content-type": Heartbeat.streamContentType },
      });
    },
    port: 0,
  });

const configFor = (upstreamPort: number, port: number): HeartbeatConfig => ({
  apiKey: Option.none(),
  idleTimeoutSeconds: 1,
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

/**
 * A plain completion cannot be padded with SSE comments, so nothing at all
 * travels while llama.cpp processes the prompt. Bun would close such an idle
 * connection — here after one second — and llama.cpp, seeing its peer go away,
 * cancels the task it was working on. Relayed requests therefore opt out of
 * the idle timeout entirely.
 */
describe("a silent non-streamed answer", () => {
  test(
    "outlives the idle timeout of the connection",
    async () => {
      const upstream: Server<unknown> = Bun.serve({
        fetch: async (request: Request): Promise<Response> =>
          new URL(request.url).pathname === Heartbeat.paths.health
            ? Response.json({ status: "ok" })
            : Bun.sleep(silence).then(
                (): Response =>
                  Response.json({ choices: [{ message: { content: "OK" } }] }),
              ),
        port: 0,
      });
      const config: HeartbeatConfig = configFor(portOf(upstream), 49_965);
      const answered: string = await withFront(
        config,
        fetchText(frontUrl(config, "/v1/chat/completions"), {
          body: JSON.stringify({ stream: false }),
          method: "POST",
        }),
      );
      await upstream.stop(true);
      expect(answered).toContain("OK");
    },
    silence * 3,
  );
});

/**
 * Only a streamed completion can be answered before llama.cpp has spoken: for
 * anything else the front has to wait, since it cannot invent a status code.
 */
describe("wantsStream", () => {
  test("recognizes a streamed completion", () => {
    expect(wantsStream(JSON.stringify({ messages: [], stream: true }))).toBe(
      true,
    );
  });

  test("leaves a plain completion alone", () => {
    expect(wantsStream(JSON.stringify({ messages: [], stream: false }))).toBe(
      false,
    );
    expect(wantsStream(JSON.stringify({ messages: [] }))).toBe(false);
  });

  test("a body that is not a JSON object is never streamed", () => {
    expect(wantsStream("")).toBe(false);
    expect(wantsStream("not-json")).toBe(false);
    expect(wantsStream(JSON.stringify({ stream: "true" }))).toBe(false);
  });
});

/**
 * A client that gives up must take llama.cpp's task with it: a slot left
 * generating for nobody is a GPU held hostage.
 */
describe("a client that hangs up", () => {
  test(
    "cancels the request llama.cpp was working on",
    async () => {
      let abandoned = false;
      const upstream: Server<unknown> = Bun.serve({
        fetch: async (request: Request): Promise<Response> => {
          request.signal.addEventListener("abort", (): void => {
            abandoned = true;
          });
          await Bun.sleep(silence);
          return Response.json({ ok: true });
        },
        port: 0,
      });
      const config: HeartbeatConfig = configFor(portOf(upstream), 49_966);
      const controller: AbortController = new AbortController();
      await withFront(config, async (): Promise<void> => {
        const answer: Promise<Response> = fetch(
          frontUrl(config, "/v1/chat/completions"),
          {
            body: JSON.stringify({ stream: false }),
            method: "POST",
            signal: controller.signal,
          },
        );
        await Bun.sleep(200);
        controller.abort();
        await answer.catch((): undefined => undefined);
        await Bun.sleep(200);
      });
      await upstream.stop(true);
      expect(abandoned).toBe(true);
    },
    silence * 3,
  );
});

/**
 * Measured, not assumed: Bun's fetch cuts a silent request at 300 seconds and
 * `timeout: false` holds past 400. Prompt processing on a long context takes
 * longer than the former, so the front would drop the connection and make
 * llama.cpp cancel the task it was asked to protect.
 */
describe("upstreamRequest", () => {
  test("waits for llama.cpp however long it takes", () => {
    const request: Request = new Request("http://front/v1/chat/completions", {
      body: "{}",
      method: "POST",
    });
    expect(upstreamRequest(request, "{}").timeout).toBe(false);
  });

  test("carries the client's signal, so giving up frees the slot", () => {
    const request: Request = new Request("http://front/v1/chat/completions", {
      body: "{}",
      method: "POST",
    });
    expect(upstreamRequest(request, "{}").signal).toBe(request.signal);
  });

  test("relays a body only when there is one", () => {
    const request: Request = new Request("http://front/health");
    expect(upstreamRequest(request, "").body).toBeUndefined();
  });
});

/**
 * Once the SSE answer is committed its status is already sent, so a failing
 * upstream can only be told inside the stream — never dumped raw to the logs
 * as an unhandled rejection.
 */
describe("an upstream that fails after the answer was committed", () => {
  test(
    "ends the committed stream with an error event",
    async () => {
      const upstream: Server<unknown> = Bun.serve({
        fetch: async (request: Request): Promise<Response> =>
          new URL(request.url).pathname === Heartbeat.paths.health
            ? Response.json({ status: "ok" })
            : Bun.sleep(silence).then((): Response => Response.json({})),
        port: 0,
      });
      const config: HeartbeatConfig = configFor(portOf(upstream), 49_967);
      const body: string = await withFront(
        config,
        async (): Promise<string> => {
          const answer: Promise<Response> = fetch(
            frontUrl(config, "/v1/chat/completions"),
            { body: JSON.stringify({ stream: true }), method: "POST" },
          );
          // Long enough for the front to commit the stream, then llama.cpp dies.
          await Bun.sleep(keepAliveMs * 4);
          await upstream.stop(true);
          return await (await answer).text();
        },
      );
      expect(body).toContain(Heartbeat.keepAliveComment);
      expect(body).toContain('"error"');
      expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
    },
    silence * 3,
  );
});
