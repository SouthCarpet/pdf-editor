import { describe, expect, it } from "vitest";
import {
  clampToPage,
  defaultOwnFieldRect,
  drawnOwnFieldRect,
  suggestFieldName,
} from "../ownFieldGeometry";

// Plan 119 §2.1 and §2.3 T1/T2: PDF points, with a 612 x 792 page.
describe("own field geometry", () => {
  it("T1 normalizes a reverse drag", () => {
    expect(drawnOwnFieldRect([100, 200], [40, 260])).toEqual([40, 200, 100, 260]);
  });

  it("T1 grows a short drag to 12 x 12 from the start", () => {
    expect(drawnOwnFieldRect([100, 200], [103, 204])).toEqual([100, 200, 112, 212]);
    expect(drawnOwnFieldRect([100, 200], [97, 196])).toEqual([88, 188, 100, 200]);
    expect(drawnOwnFieldRect([100, 200], [100, 200])).toEqual([100, 200, 112, 212]);
  });

  it("T2 places a 140 x 22 text box below the click and clamps it", () => {
    expect(defaultOwnFieldRect([300, 400], "text", [0, 0, 612, 792])).toEqual([300, 378, 440, 400]);
    expect(defaultOwnFieldRect([600, 10], "text", [0, 0, 612, 792])).toEqual([472, 10, 612, 32]);
  });

  it("places a 14 x 14 checkbox below the click", () => {
    expect(defaultOwnFieldRect([300, 400], "checkbox", [0, 0, 612, 792])).toEqual([300, 386, 314, 400]);
  });

  it("clamps a box to an offset page and caps a box larger than the page", () => {
    expect(clampToPage([600, -10, 740, 12], [10, 20, 622, 812])).toEqual([482, 20, 622, 42]);
    expect(clampToPage([0, 0, 140, 22], [0, 0, 80, 20])).toEqual([0, 0, 80, 20]);
  });

  // Plan 119 §2.2 N: use the first free name; the writer remains authoritative.
  it("suggests the first unused field name", () => {
    expect(suggestFieldName([])).toBe("Field");
    expect(suggestFieldName(["Field", "Field_2", "Field_4"])).toBe("Field_3");
  });
});
