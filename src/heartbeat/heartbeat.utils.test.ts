import { describe, expect, test } from "bun:test";
import {
  summarize,
  upstreamRequest,
  wantsStream,
} from "@app/heartbeat/heartbeat.utils.ts";

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

/** An agent configured with `"model": ""` is worth seeing in the logs. */
describe("summarize", () => {
  test("reads the stream flag and the model of a request", () => {
    expect(summarize(JSON.stringify({ model: "phi", stream: true }))).toEqual({
      asked: true,
      model: "phi",
    });
  });

  test("reports an empty model as such", () => {
    expect(summarize(JSON.stringify({ model: "", stream: true }))).toEqual({
      asked: true,
      model: "",
    });
  });

  test("survives a body that is not a completion", () => {
    expect(summarize("not-json")).toEqual({ asked: false, model: "" });
  });
});
