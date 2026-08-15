import { Secrets } from "@app/secret/secret.constants.ts";
import { Data } from "effect";

class MissingSecretError extends Data.TaggedError("MissingSecretError")<{
  readonly name: string;
}> {
  override get message(): string {
    return Secrets.messages.missing(this.name);
  }
}

class EmptyTunnelTokenError extends Data.TaggedError("EmptyTunnelTokenError")<{
  readonly variable: string;
}> {
  override get message(): string {
    return Secrets.messages.emptyTunnelToken;
  }
}

export { EmptyTunnelTokenError, MissingSecretError };
