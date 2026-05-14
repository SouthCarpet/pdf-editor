import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  it("joins simple class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("handles conditional objects (clsx semantics)", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("merges conflicting tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("preserves non-conflicting tailwind classes verbatim", () => {
    const result = cn("text-sm", "font-medium", "text-red-500");
    expect(result).toContain("text-sm");
    expect(result).toContain("font-medium");
    expect(result).toContain("text-red-500");
  });
});
