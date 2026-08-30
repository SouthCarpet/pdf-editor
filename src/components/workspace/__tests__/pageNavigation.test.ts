import { describe, expect, it } from "vitest";
import { parsePageInput } from "../pageNavigation";

describe("parsePageInput", () => {
  // Oracle: T3.1 R1 says the toolbar accepts a one-based in-range page.
  it("keeps an in-range integer", () => {
    expect(parsePageInput("3", 12)).toBe(3);
  });

  // Oracle: T3.1 R1 says page input clamps to the available range.
  it.each([
    ["0", 1],
    ["99", 12],
  ])("clamps %s to %i", (value, expected) => {
    expect(parsePageInput(value, 12)).toBe(expected);
  });

  // Oracle: T3.1 R1 says non-numeric input reverts instead of navigating.
  it.each(["three", "3.5", "", "  "])("rejects malformed value %j", (value) => {
    expect(parsePageInput(value, 12)).toBeNull();
  });
});
