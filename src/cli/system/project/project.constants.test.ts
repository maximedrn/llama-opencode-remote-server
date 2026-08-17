import { describe, expect, test } from "bun:test";
import { Project } from "@app/cli/system/project/project.constants.ts";
import { projectPath } from "@app/cli/system/project/project.utils.ts";

/**
 * Every path the CLI hands to Compose, `.env` and `secrets/` hangs off this
 * one constant, and it is resolved by counting directories upwards: moving
 * this file without fixing the count points the whole stack at the wrong
 * directory, silently. These two assertions are that guard.
 */
describe("Project.root", () => {
  test("is the repository root, not a directory inside src", async () => {
    expect(await Bun.file(projectPath("package.json")).exists()).toBe(true);
    expect(
      await Bun.file(projectPath("docker/docker-compose.yaml")).exists(),
    ).toBe(true);
  });

  test("ends with a separator, so projectPath can append directly", () => {
    expect(Project.root.endsWith("/")).toBe(true);
  });
});
