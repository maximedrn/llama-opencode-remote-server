import { describe, expect, test } from "bun:test";
import { composeArgs } from "@app/docker/docker.utils.ts";
import { Project } from "@app/project/project.constants.ts";

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

  test("a custom compose file is layered last, so it wins", () => {
    expect(
      composeArgs("cpu", {
        local: true,
        overrideFile: "docker/docker-compose.rig.yaml",
      }).slice(-4),
    ).toEqual([
      "-f",
      "docker/docker-compose.local.yaml",
      "-f",
      "docker/docker-compose.rig.yaml",
    ]);
  });
});
