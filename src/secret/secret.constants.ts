import { projectPath } from "@app/project/project.utils.ts";

/** Docker secrets and the material used to generate them. */
const Secrets = {
  apiKey: {
    /** 256 bits of CSPRNG entropy. */
    byteLength: 32,
    prefix: "llama_",
  },
  directory: projectPath("secrets"),
  /** Secrets a Cloudflare-fronted stack needs. */
  edgeFiles: ["llama_api_key.txt", "cloudflare_tunnel_token.txt"],
  files: {
    apiKey: "llama_api_key.txt",
    tunnelToken: "cloudflare_tunnel_token.txt",
  },
  fingerprint: {
    algorithm: "sha256",
    encoding: "hex",
    length: 16,
  },
  /** Secrets a local-only stack needs: llama.cpp still requires its key. */
  localFiles: ["llama_api_key.txt"],
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
