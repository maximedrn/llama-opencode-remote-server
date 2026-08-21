import { describe, expect, test } from "bun:test";
import type { ComposeStatusEntry } from "@app/cli/resource/docker/docker.types.ts";
import {
  composeArgs,
  parseComposeStatus,
} from "@app/cli/resource/docker/docker.utils.ts";
import { Project } from "@app/cli/system/project/project.constants.ts";

const root: string = Project.root;

describe("composeArgs", () => {
  test("remote stack selects the edge profile without the local file", () => {
    expect(composeArgs("cpu", {})).toEqual([
      "compose",
      "--project-directory",
      root,
      "--profile",
      "edge",
      "-f",
      "docker/docker-compose.yaml",
      "-f",
      "docker/docker-compose.cpu.yaml",
    ]);
  });

  test("local stack drops the edge profile and appends the local file", () => {
    expect(composeArgs("nvidia", { local: true })).toEqual([
      "compose",
      "--project-directory",
      root,
      "-f",
      "docker/docker-compose.yaml",
      "-f",
      "docker/docker-compose.nvidia.yaml",
      "-f",
      "docker/docker-compose.local.yaml",
    ]);
  });

  test("each backend resolves its own compose file", () => {
    expect(composeArgs("amd", {}).at(-1)).toBe(
      "docker/docker-compose.amd.yaml",
    );
    expect(composeArgs("cpu", {}).at(-1)).toBe(
      "docker/docker-compose.cpu.yaml",
    );
  });

  test("a custom file replaces the shipped llama definition", () => {
    expect(
      composeArgs("cpu", { llamaFile: "docker/docker-compose.rig.yaml" }),
    ).toEqual([
      "compose",
      "--project-directory",
      root,
      "--profile",
      "edge",
      "-f",
      "docker/docker-compose.yaml",
      "-f",
      "docker/docker-compose.rig.yaml",
    ]);
  });

  test("the keep-alive front is layered after llama, before the local file", () => {
    expect(composeArgs("cpu", { keepalive: true, local: true })).toEqual([
      "compose",
      "--project-directory",
      root,
      "-f",
      "docker/docker-compose.yaml",
      "-f",
      "docker/docker-compose.cpu.yaml",
      "-f",
      "docker/docker-compose.keepalive.yaml",
      "-f",
      "docker/docker-compose.keepalive.local.yaml",
    ]);
  });
});

describe("parseComposeStatus", () => {
  test("reads the JSON array shape", () => {
    expect(
      parseComposeStatus(
        JSON.stringify([
          { Health: "healthy", Service: "heartbeat", State: "running" },
          { Service: "llama", State: "running" },
        ]),
      ),
    ).toEqual([
      { health: "healthy", service: "heartbeat", state: "running" },
      { health: "", service: "llama", state: "running" },
    ]);
  });

  test("reads the one-object-per-line shape", () => {
    const lines: string = [
      JSON.stringify({
        Health: "starting",
        Service: "llama",
        State: "running",
      }),
      JSON.stringify({ Health: "healthy", Service: "proxy", State: "running" }),
    ].join("\n");
    expect(
      parseComposeStatus(lines).map(
        (entry: ComposeStatusEntry): string => entry.service,
      ),
    ).toEqual(["llama", "proxy"]);
  });

  test("treats empty and malformed output as no container", () => {
    expect(parseComposeStatus("")).toEqual([]);
    expect(parseComposeStatus("not-json")).toEqual([]);
    expect(parseComposeStatus(JSON.stringify([{ State: "running" }]))).toEqual(
      [],
    );
  });
});
