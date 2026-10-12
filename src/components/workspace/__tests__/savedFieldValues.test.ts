// Plan 119 p1: after a save (and after reopening the saved copy) a detected
// cell that already holds a saved value shows as filled. The value lives in
// the PDF as a FreeText annotation over the cell.
import { describe, expect, it } from "vitest";
import type { DetectedFormField } from "@/bindings";
import { fieldsWithSavedValues, savedFreeTextRects } from "../savedFieldValues";

function field(id: string, rect: [number, number, number, number]): DetectedFormField {
  return { id, page_index: 0, rect, kind: "box", confidence: 0.9 };
}

const CELLS = [field("0:0", [97, 626, 153, 640]), field("0:1", [156, 626, 214, 640])];

describe("fieldsWithSavedValues", () => {
  it("marks the cell under a saved value, matched by the value's centre", () => {
    expect(fieldsWithSavedValues(CELLS, [[97, 626, 153, 640]])).toEqual(new Set(["0:0"]));
  });

  it("still matches a value the user moved or resized inside the cell", () => {
    expect(fieldsWithSavedValues(CELLS, [[160, 628, 200, 650]])).toEqual(new Set(["0:1"]));
  });

  it("marks nothing for a value outside every cell or with no rect", () => {
    expect(fieldsWithSavedValues(CELLS, [[300, 300, 400, 320]])).toEqual(new Set());
    expect(fieldsWithSavedValues(CELLS, [])).toEqual(new Set());
  });
});

describe("savedFreeTextRects", () => {
  it("keeps only FreeText annotations with a four-number rect", () => {
    expect(
      savedFreeTextRects([
        { subtype: "FreeText", rect: [1, 2, 3, 4] },
        { subtype: "Highlight", rect: [5, 6, 7, 8] },
        { subtype: "FreeText", rect: [1, 2] },
        { subtype: "FreeText" },
      ])
    ).toEqual([[1, 2, 3, 4]]);
  });
});
