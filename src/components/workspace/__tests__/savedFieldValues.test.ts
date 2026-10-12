// Plan 119 p1: after a save (and after reopening the saved copy) a detected
// cell that already holds a saved value shows as filled. The value lives in
// the PDF as a FreeText annotation over the cell.
import { describe, expect, it } from "vitest";
import type { DetectedFormField } from "@/bindings";
import {
  annotationRefFromPdfjsId,
  fieldsWithSavedValues,
  pdfjsAnnotationId,
  savedFreeTexts,
  savedValueInField,
} from "../savedFieldValues";

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

describe("savedFreeTexts", () => {
  it("keeps only FreeText annotations with a four-number rect, with value and object", () => {
    expect(
      savedFreeTexts([
        {
          subtype: "FreeText",
          id: "12R",
          rect: [1, 2, 3, 4],
          contentsObj: { str: "07:00" },
          defaultAppearanceData: { fontSize: 8.4 },
        },
        { subtype: "Highlight", id: "13R", rect: [5, 6, 7, 8] },
        { subtype: "FreeText", id: "14R", rect: [1, 2] },
        { subtype: "FreeText", id: "15R" },
      ])
    ).toEqual([
      { rect: [1, 2, 3, 4], contents: "07:00", sizePt: 8.4, ref: { object: 12, generation: 0 } },
    ]);
  });

  it("keeps a value with no contents or object id, without a ref", () => {
    expect(savedFreeTexts([{ subtype: "FreeText", rect: [1, 2, 3, 4] }])).toEqual([
      { rect: [1, 2, 3, 4], contents: "", sizePt: null, ref: null },
    ]);
  });
});

describe("pdf.js annotation ids", () => {
  it("reads the object number and generation of an indirect annotation", () => {
    expect(annotationRefFromPdfjsId("12R")).toEqual({ object: 12, generation: 0 });
    expect(annotationRefFromPdfjsId("12R3")).toEqual({ object: 12, generation: 3 });
  });

  it("has no object for a direct annotation or no id", () => {
    expect(annotationRefFromPdfjsId("pdfjs_internal_id_7")).toBeNull();
    expect(annotationRefFromPdfjsId(undefined)).toBeNull();
  });

  it("writes the id pdf.js uses for the same object", () => {
    expect(pdfjsAnnotationId({ object: 12, generation: 0 })).toBe("12R");
    expect(pdfjsAnnotationId({ object: 12, generation: 3 })).toBe("12R3");
  });
});

describe("savedValueInField", () => {
  const value = (rect: [number, number, number, number]) => ({
    rect,
    contents: "x",
    sizePt: null,
    ref: { object: 1, generation: 0 },
  });

  it("finds the saved value whose centre lies in the cell", () => {
    const inSecond = value([160, 628, 200, 650]);
    expect(savedValueInField(CELLS[1], [value([300, 300, 400, 320]), inSecond])).toBe(inSecond);
    expect(savedValueInField(CELLS[0], [inSecond])).toBeUndefined();
  });
});
