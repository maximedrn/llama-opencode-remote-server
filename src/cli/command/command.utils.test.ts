import { describe, expect, test } from "bun:test";
import { keepaliveChoice } from "@app/cli/command/command.utils.ts";
import { Option } from "effect";

/**
 * A bare `--keepalive` flag reads as `false` when it is absent, which is
 * indistinguishable from "turn it off" — that is exactly how KEEPALIVE in
 * `.env` used to be overridden without anyone asking for it.
 */
describe("keepaliveChoice", () => {
  test("no flag leaves the decision to .env", () => {
    expect(keepaliveChoice(false, false)).toEqual(Option.none());
  });

  test("--keepalive forces the front on", () => {
    expect(keepaliveChoice(true, false)).toEqual(Option.some(true));
  });

  test("--no-keepalive forces it off", () => {
    expect(keepaliveChoice(false, true)).toEqual(Option.some(false));
  });

  test("asking for both keeps the front, the safer of the two", () => {
    expect(keepaliveChoice(true, true)).toEqual(Option.some(true));
  });
});
