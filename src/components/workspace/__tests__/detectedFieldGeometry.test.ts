// Plan 050 task D2-UX-2 (R7d): `buildFreeText`'s default font-size rule,
// `min(12, heightPt * 0.6)`. Regression-proofed against a mutated
// multiplier: with `heightPt = 10`, 0.6 gives 6pt, but any other factor
// (0.5 -> 5, 0.7 -> 7, ...) gives a different number, so this fails loudly
// if the constant drifts.
import { describe, expect, it } from "vitest";
import type { DetectedFormField } from "@/bindings";
import { buildFreeText } from "../detectedFieldGeometry";

function field(rect: DetectedFormField["rect"]): DetectedFormField {
  return { id: "0:0", page_index: 0, rect, kind: "box", confidence: 0.9 };
}

describe("buildFreeText default size rule", () => {
  it("is heightPt * 0.6 when that is below the 12pt cap", () => {
    // top=710, bottom=700 -> heightPt=10 -> 10 * 0.6 = 6.
    const annotation = buildFreeText(field([100, 700, 250, 710]), "Peter");
    expect(annotation.type).toBe("free_text");
    if (annotation.type !== "free_text") throw new Error("unreachable");
    expect(annotation.style.size_pt).toBe(6);
  });

  it("is capped at 12pt once heightPt * 0.6 would exceed it", () => {
    // top=730, bottom=700 -> heightPt=30 -> 30 * 0.6 = 18, capped to 12.
    const annotation = buildFreeText(field([100, 700, 250, 730]), "Peter");
    if (annotation.type !== "free_text") throw new Error("unreachable");
    expect(annotation.style.size_pt).toBe(12);
  });

  it("falls back to 12pt for a non-positive height (missing/degenerate rect)", () => {
    const annotation = buildFreeText(field([100, 700, 250, 700]), "Peter");
    if (annotation.type !== "free_text") throw new Error("unreachable");
    expect(annotation.style.size_pt).toBe(12);
  });

  it("keeps the field's rect and the given contents", () => {
    const rect: DetectedFormField["rect"] = [100, 700, 250, 710];
    const annotation = buildFreeText(field(rect), "Peter");
    if (annotation.type !== "free_text") throw new Error("unreachable");
    expect(annotation.rect).toEqual(rect);
    expect(annotation.contents).toBe("Peter");
    expect(annotation.page).toBe(0);
  });
});
