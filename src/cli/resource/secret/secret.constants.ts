import { projectPath } from "@app/cli/system/project/project.utils.ts";

/** Docker secrets and the material used to generate them. */
const Secrets = {
  apiKey: {
    /** 256 bits of CSPRNG entropy. */
    byteLength: 32,
    prefix: "llama_",
  },
  directory: projectPath("secrets"),
  /** Names Compose mounts as Docker secrets; hidden files, never committed. */
  files: {
    apiKey: ".llama_api_key",
    tunnelToken: ".cloudflare_tunnel_token",
  },
  fingerprint: {
    algorithm: "sha256",
    encoding: "hex",
    length: 16,
  },
  messages: {
    emptyTunnelToken: "Cloudflare Tunnel token cannot be empty.",
    missing: (name: string): string => `Missing secrets/${name}. Run \`init\`.`,
    tunnelTokenPrompt: "Cloudflare Tunnel token",
  },
  /** Owner read/write only; Compose mounts these files into the containers. */
  mode: 0o600,
  tunnelTokenVariable: "CLOUDFLARE_TUNNEL_TOKEN",
} as const;

export { Secrets };
