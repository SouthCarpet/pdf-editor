import { afterEach, describe, expect, it, vi } from "vitest";
import { readToken, withAlpha } from "../tokens";

describe("readToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the computed token, trimmed", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => (name === "--color-accent" ? "  #2563eb  " : ""),
    }));
    expect(readToken("--color-accent", "#1d4ed8")).toBe("#2563eb");
  });

  it("returns the fallback when the variable is empty (jsdom)", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: () => "   ",
    }));
    expect(readToken("--color-accent", "#1d4ed8")).toBe("#1d4ed8");
    expect(readToken("--color-background", "#fafafa")).toBe("#fafafa");
  });
});

describe("withAlpha", () => {
  it("turns hex background tokens into rgba at the given alpha", () => {
    expect(withAlpha("#fafafa", 0.4)).toBe("rgba(250, 250, 250, 0.4)");
    expect(withAlpha("#0a0a0a", 0.4)).toBe("rgba(10, 10, 10, 0.4)");
    expect(withAlpha("#1d4ed8", 1)).toBe("rgba(29, 78, 216, 1)");
  });

  it("keeps rgb() channels and replaces the alpha", () => {
    expect(withAlpha("rgb(250, 250, 250)", 0.4)).toBe("rgba(250, 250, 250, 0.4)");
  });

  it("sets the alpha of an oklch() token, replacing an alpha it has", () => {
    expect(withAlpha("oklch(0.96 0.012 260)", 0.4)).toBe("oklch(0.96 0.012 260 / 0.4)");
    expect(withAlpha("oklch(0.18 0.012 260 / 0.4)", 0.25)).toBe("oklch(0.18 0.012 260 / 0.25)");
  });
});
