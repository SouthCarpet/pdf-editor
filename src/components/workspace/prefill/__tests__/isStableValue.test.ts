import { describe, expect, it } from "vitest";
import { isStableValue } from "../isStableValue";

describe("isStableValue", () => {
  it("treats Slovak names and sites as stable", () => {
    expect(isStableValue("Peter Novák")).toBe(true);
    expect(isStableValue("Stavenisko A")).toBe(true);
    expect(isStableValue("Bratislava")).toBe(true);
  });

  it("rejects Slovak dates and similar date-like values", () => {
    expect(isStableValue("31.8.2026")).toBe(false);
    expect(isStableValue("31. 8. 2026")).toBe(false);
    expect(isStableValue("31. 8.")).toBe(false);
    expect(isStableValue("31.8.")).toBe(false);
    expect(isStableValue("1.9.")).toBe(false);
    expect(isStableValue("31. 8")).toBe(false);
    expect(isStableValue("2026-08-31")).toBe(false);
  });

  it("rejects empty text and 1 to 3 digit hour counts", () => {
    expect(isStableValue("")).toBe(false);
    expect(isStableValue("   ")).toBe(false);
    expect(isStableValue("8")).toBe(false);
    expect(isStableValue("12")).toBe(false);
    expect(isStableValue("160")).toBe(false);
  });

  it("keeps a four-digit number and mixed text with digits", () => {
    expect(isStableValue("2024")).toBe(true);
    expect(isStableValue("hala 12")).toBe(true);
  });
});
