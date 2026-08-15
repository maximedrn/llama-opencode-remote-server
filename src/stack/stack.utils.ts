import { Stack } from "@app/stack/stack.constants.ts";

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

/** OpenAI-compatible payload, so the field names are not ours to rename. */
const makeCompletionRequest = (model: string): CompletionRequest => ({
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire format.
  max_tokens: Stack.local.maxTokens,
  messages: [{ content: Stack.local.prompt, role: Stack.local.role }],
  model,
});

export { makeCompletionRequest };
