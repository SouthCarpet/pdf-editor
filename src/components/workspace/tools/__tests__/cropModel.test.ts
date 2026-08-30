import { describe, expect, it } from "vitest";
import { MIN_RESIZE_SIZE_PT, resizeRectEdge } from "../../pendingAnnotationGeometry";
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  cropPreviewClip,
  fromPercent,
  mmToPt,
  moveCropRect,
  presetA4,
  presetFullPage,
  presetMargins,
  ptToMm,
  resizeCropRect,
  toDisplay,
  type CropPage,
  type CropRect,
} from "../cropModel";

const PAGE: CropPage = { width: 400, height: 600 };
const RECT: CropRect = { x: 80, y: 100, width: 120, height: 80 };

describe("resizeCropRect", () => {
  it("moves the east edge and keeps x fixed, matching resizeRectEdge", () => {
    const next = resizeCropRect(RECT, "e", 30, 0, PAGE);
    const tuple = resizeRectEdge([80, 100, 200, 180], "right", 230);
    expect(next).toEqual({ x: tuple[0], y: tuple[1], width: tuple[2] - tuple[0], height: tuple[3] - tuple[1] });
  });

  it("moves the west edge and keeps the right edge fixed", () => {
    const next = resizeCropRect(RECT, "w", 20, 0, PAGE);
    expect(next.x).toBe(100);
    expect(next.x + next.width).toBe(200);
    expect(next.y).toBe(100);
    expect(next.height).toBe(80);
  });

  it("moves the north edge (screen top) without moving the south edge", () => {
    const next = resizeCropRect(RECT, "n", 0, 10, PAGE);
    expect(next.y).toBe(110);
    expect(next.y + next.height).toBe(180);
  });

  it("moves a south-east corner on both axes", () => {
    const next = resizeCropRect(RECT, "se", 15, 25, PAGE);
    expect(next).toEqual({ x: 80, y: 100, width: 135, height: 105 });
  });

  it("does not invert when a west handle is dragged past the minimum size", () => {
    const next = resizeCropRect(RECT, "w", 200, 0, PAGE, MIN_RESIZE_SIZE_PT);
    expect(next.width).toBe(MIN_RESIZE_SIZE_PT);
    expect(next.x + next.width).toBe(200);
  });

  it("clamps an east handle to the page width", () => {
    const next = resizeCropRect(RECT, "e", 1000, 0, PAGE);
    expect(next.x).toBe(80);
    expect(next.x + next.width).toBe(400);
  });

  it("clamps a north handle to y = 0", () => {
    const next = resizeCropRect(RECT, "n", 0, -1000, PAGE);
    expect(next.y).toBe(0);
    expect(next.y + next.height).toBe(180);
  });
});

describe("moveCropRect", () => {
  it("translates the rectangle and keeps its size", () => {
    expect(moveCropRect(RECT, 10, -20, PAGE)).toEqual({ x: 90, y: 80, width: 120, height: 80 });
  });

  it("clamps so the rectangle stays on the page", () => {
    expect(moveCropRect(RECT, 1000, 1000, PAGE)).toEqual({
      x: 280,
      y: 520,
      width: 120,
      height: 80,
    });
  });
});

describe("fromPercent", () => {
  it("builds a centred 30 percent crop of the original page", () => {
    expect(fromPercent(PAGE, 30, 30)).toEqual({ x: 140, y: 210, width: 120, height: 180 });
  });

  it("anchors at the top-left when asked", () => {
    expect(fromPercent(PAGE, 50, 25, "topLeft")).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 150,
    });
  });

  it("clamps a 200 percent request to the page", () => {
    expect(fromPercent(PAGE, 200, 200)).toEqual({ x: 0, y: 0, width: 400, height: 600 });
  });
});

describe("presetA4", () => {
  it("centres portrait A4 (210 x 297 mm at 72 pt/in) on a portrait page", () => {
    const page: CropPage = { width: 800, height: 1100 };
    const next = presetA4(page);
    expect(next.width).toBeCloseTo(595.28, 2);
    expect(next.height).toBeCloseTo(841.89, 2);
    expect(next.x).toBeCloseTo((800 - next.width) / 2, 6);
    expect(next.y).toBeCloseTo((1100 - next.height) / 2, 6);
  });

  it("uses landscape A4 on a landscape page", () => {
    const page: CropPage = { width: 1100, height: 800 };
    const next = presetA4(page);
    expect(next.width).toBeCloseTo(841.89, 2);
    expect(next.height).toBeCloseTo(595.28, 2);
    expect(next.x).toBeCloseTo((1100 - next.width) / 2, 6);
    expect(next.y).toBeCloseTo((800 - next.height) / 2, 6);
  });

  it("clamps A4 to a page smaller than A4", () => {
    expect(presetA4({ width: 400, height: 500 })).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 500,
    });
  });

  it("clamps portrait A4 onto a US Letter page (612 x 792 pt)", () => {
    // Hand-checked oracle: 210 mm = 595.275590... pt, 297 mm = 841.889... pt.
    // Height clamps to 792; x centres the remaining width. Asserted to 4 d.p.
    // (the brief's rounding); y and height are exact integers.
    const next = presetA4({ width: 612, height: 792 });
    expect(next.x).toBeCloseTo(8.3622, 4);
    expect(next.y).toBe(0);
    expect(next.width).toBeCloseTo(595.2756, 4);
    expect(next.height).toBe(792);
  });
});

describe("presetMargins and presetFullPage", () => {
  it("insets every side by 10 mm", () => {
    const inset = 28.346456692913385;
    const next = presetMargins(PAGE, 10);
    expect(next.x).toBeCloseTo(inset, 6);
    expect(next.y).toBeCloseTo(inset, 6);
    expect(next.width).toBeCloseTo(400 - 2 * inset, 6);
    expect(next.height).toBeCloseTo(600 - 2 * inset, 6);
  });

  it("does not invert when the margin is larger than the page", () => {
    const next = presetMargins({ width: 40, height: 40 }, 100);
    expect(next).toEqual({ x: 14, y: 14, width: 12, height: 12 });
  });

  it("covers the whole page", () => {
    expect(presetFullPage(PAGE)).toEqual({ x: 0, y: 0, width: 400, height: 600 });
  });
});

describe("toDisplay and mm conversion", () => {
  it("converts 72 pt to 25.4 mm", () => {
    expect(ptToMm(72)).toBeCloseTo(25.4, 10);
    expect(mmToPt(25.4)).toBeCloseTo(72, 10);
  });

  it("reports millimetres and percent of the original page", () => {
    const display = toDisplay({ x: 72, y: 0, width: 200, height: 300 }, PAGE);
    expect(display.xMm).toBeCloseTo(25.4, 10);
    expect(display.widthPct).toBe(50);
    expect(display.heightPct).toBe(50);
    expect(A4_WIDTH_MM).toBe(210);
    expect(A4_HEIGHT_MM).toBe(297);
  });
});

describe("cropPreviewClip", () => {
  it("scales the crop rectangle into a PdfViewer fit box", () => {
    const clip = cropPreviewClip(
      { x: 20, y: 10, width: 60, height: 40 },
      { width: 200, height: 100 },
      { width: 100, height: 100 },
    );
    expect(clip.scale).toBe(0.5);
    expect(clip.fittedWidth).toBe(100);
    expect(clip.fittedHeight).toBe(50);
    expect(clip.clipX).toBe(10);
    expect(clip.clipY).toBe(5);
    expect(clip.clipWidth).toBe(30);
    expect(clip.clipHeight).toBe(20);
    expect(clip.inset).toEqual({ top: 5, right: 60, bottom: 25, left: 10 });
  });
});
