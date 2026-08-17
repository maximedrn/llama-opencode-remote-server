import { Client } from "@app/cli/client/client.constants.ts";
import { ClientFile } from "@app/cli/env/env.constants.ts";
import type { HttpClientRequest } from "@effect/platform";
import { Data, Schema } from "effect";

interface CompletionMessage {
  readonly content: string;
  readonly role: string;
}

interface CompletionRequest {
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
  readonly max_tokens: number;
  readonly messages: readonly CompletionMessage[];
  readonly model: string;
}

/** A request ready to send, with the endpoint kept for the error messages. */
interface ClientTarget {
  readonly endpoint: string;
  readonly request: HttpClientRequest.HttpClientRequest;
}

/** The answer must be an OpenAI chat completion, not merely an HTTP 200. */
const completionResponseSchema = Schema.Struct({
  choices: Schema.NonEmptyArray(
    Schema.Struct({ message: Schema.Struct({ content: Schema.String }) }),
  ),
});

const modelsResponseSchema = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: Schema.String })),
});

type CompletionResponse = Schema.Schema.Type<typeof completionResponseSchema>;
type ModelsResponse = Schema.Schema.Type<typeof modelsResponseSchema>;

class LlamaRequestError extends Data.TaggedError("LlamaRequestError")<{
  readonly body: string;
  readonly status: number;
}> {
  override get message(): string {
    return Client.messages.requestFailed(this.status, this.body);
  }
}

class LlamaResponseError extends Data.TaggedError("LlamaResponseError")<{
  readonly endpoint: string;
  readonly reason: string;
}> {
  override get message(): string {
    return Client.messages.notLlamaServer(this.endpoint, this.reason);
  }
}

/** The endpoint answered, but refused the credentials it was given. */
class LlamaAuthError extends Data.TaggedError("LlamaAuthError")<{
  readonly endpoint: string;
}> {
  override get message(): string {
    return Client.messages.llamaAuth(this.endpoint);
  }
}

/** Nothing answered at all: the stack is down, or the URL points elsewhere. */
class LlamaUnreachableError extends Data.TaggedError("LlamaUnreachableError")<{
  readonly endpoint: string;
  readonly reason: string;
}> {
  override get message(): string {
    return Client.messages.llamaUnreachable(this.endpoint, this.reason);
  }
}

/** `client.env` is filled in by hand, so `init` cannot vouch for it. */
class MissingClientConfigError extends Data.TaggedError(
  "MissingClientConfigError",
)<{
  readonly variable: string;
}> {
  override get message(): string {
    return ClientFile.messages.missing(this.variable);
  }
}

export {
  type ClientTarget,
  type CompletionRequest,
  type CompletionResponse,
  completionResponseSchema,
  LlamaAuthError,
  LlamaRequestError,
  LlamaResponseError,
  LlamaUnreachableError,
  MissingClientConfigError,
  type ModelsResponse,
  modelsResponseSchema,
};
