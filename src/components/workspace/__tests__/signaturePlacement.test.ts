import { describe, expect, it } from "vitest";
import type { DetectedFormField } from "@/bindings";
import {
  defaultStampRect,
  fitStampIntoDetectedBox,
  resizeStampRect,
} from "../signaturePlacement";

describe("signature placement geometry", () => {
  it("uses 30 percent of page width and preserves the source aspect ratio", () => {
    const rect = defaultStampRect(600, 800, 3, [300, 400]);

    expect(rect).toEqual([210, 370, 390, 430]);
  });

  it("locks the aspect ratio when a corner is resized vertically", () => {
    const rect = resizeStampRect([100, 100, 300, 200], "top-right", [340, 260], 2);

    expect(rect).toEqual([100, 100, 420, 260]);
    expect((rect[2] - rect[0]) / (rect[3] - rect[1])).toBe(2);
  });

  it("fits a signature inside a detected box with a two-point inset", () => {
    const field: DetectedFormField = {
      id: "signature-box",
      page_index: 0,
      kind: "box",
      rect: [100, 200, 304, 304],
      confidence: 0.9,
    };

    expect(fitStampIntoDetectedBox(field, 2)).toEqual([102, 202, 302, 302]);
  });
});
