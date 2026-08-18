import { Heartbeat } from "@app/heartbeat/heartbeat.constants.ts";
import type { UpstreamRequest } from "@app/heartbeat/heartbeat.types.ts";
import { Option, Predicate, Schema } from "effect";

/** A completion asking for a stream is the only one worth holding open. */
const streamRequestSchema = Schema.parseJson(
  Schema.Struct({ stream: Schema.Boolean }),
);

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const shorten = (reason: string): string =>
  reason.slice(0, Heartbeat.reasonLength);

const describe = (cause: unknown): string =>
  shorten(Predicate.isError(cause) ? cause.message : String(cause));

const isStream = (response: Response): boolean =>
  (response.headers.get(Heartbeat.headers.contentType) ?? "").includes(
    Heartbeat.streamContentType,
  );

/** Read from the request, because llama.cpp answers too late to be asked. */
const wantsStream = (body: string): boolean =>
  Option.match(Schema.decodeUnknownOption(streamRequestSchema)(body), {
    onNone: (): boolean => false,
    onSome: (request: { readonly stream: boolean }): boolean => request.stream,
  });

/** Hop-by-hop headers belong to one connection, never to the next one. */
const forwardHeaders = (request: Request): Headers => {
  const headers: Headers = new Headers(request.headers);
  for (const name of Heartbeat.hopByHopHeaders) headers.delete(name);
  return headers;
};

const withStreamHeaders = (headers: Headers): Headers => {
  headers.set(
    Heartbeat.headers.cacheControl[0],
    Heartbeat.headers.cacheControl[1],
  );
  headers.set(
    Heartbeat.headers.noBuffering[0],
    Heartbeat.headers.noBuffering[1],
  );
  return headers;
};

const relayHeaders = (response: Response): Headers => {
  const headers: Headers = new Headers(response.headers);
  return isStream(response) ? withStreamHeaders(headers) : headers;
};

/** The head of an answer this process commits to before llama.cpp speaks. */
const streamHeaders = (): Headers => {
  const headers: Headers = new Headers();
  headers.set(Heartbeat.headers.contentType, Heartbeat.streamContentType);
  return withStreamHeaders(headers);
};

/**
 * `timeout: false` is what makes this process work at all: Bun's fetch gives
 * up after 300 seconds of silence, and prompt processing on a long context is
 * silent for longer than that. Without it the front drops the connection,
 * llama.cpp sees its peer disappear and cancels the very task it was asked to
 * protect. Measured, not assumed: the default cut at 300s, `false` held 400s.
 *
 * The client's own signal is forwarded so a client that gives up frees the
 * slot instead of leaving llama.cpp generating for nobody.
 */
const upstreamRequest = (request: Request, body: string): UpstreamRequest => ({
  body: body.length > 0 ? body : undefined,
  headers: forwardHeaders(request),
  method: request.method,
  redirect: "manual",
  signal: request.signal,
  timeout: false,
});

export {
  describe,
  encode,
  forwardHeaders,
  isStream,
  relayHeaders,
  shorten,
  streamHeaders,
  upstreamRequest,
  wantsStream,
};
