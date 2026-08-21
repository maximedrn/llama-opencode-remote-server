import { Secrets } from "@app/cli/resource/secret/secret.constants.ts";
import { Encoding } from "effect";

/** Web Crypto CSPRNG, prefixed so the key is recognizable in client configs. */
const generateApiKey = (): string =>
  `${Secrets.apiKey.prefix}${Encoding.encodeBase64Url(
    crypto.getRandomValues(new Uint8Array(Secrets.apiKey.byteLength)),
  )}`;

const fingerprint = (secret: string): string =>
  new Bun.CryptoHasher(Secrets.fingerprint.algorithm)
    .update(secret)
    .digest(Secrets.fingerprint.encoding)
    .slice(0, Secrets.fingerprint.length);

export { fingerprint, generateApiKey };
