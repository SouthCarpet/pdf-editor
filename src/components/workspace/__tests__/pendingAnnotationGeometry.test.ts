// Plan 050 task D2-UX (R5): the pure geometry/colour math behind the
// pending-FreeText live preview.
//
// A real `pdfjs-dist` `PageViewport` needs `DOMMatrix`, which this
// project's jsdom test environment does not provide (confirmed: importing
// `pdfjs-dist` in a vitest run throws `ReferenceError: DOMMatrix is not
// defined`). `FakeViewport` below replicates pdf.js's own rotation-0,
// non-flipped transform (Y flip + scale, `MediaBox` origin at 0,0) with
// plain arithmetic, so these tests exercise the same maths `toScreenRect`
// and `toPdfRect` are written for without needing a DOM.
import { describe, it, expect } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import type { Annotation } from "@/bindings";
import {
  clampRectToPage,
  freeTextRenderProps,
  hexToRgb01,
  MIN_RESIZE_SIZE_PT,
  resizeRectEdge,
  resizeScreenEdge,
  rgb01ToHex,
  rgbToCss,
  rgbaToCss,
  toPdfRect,
} from "../pendingAnnotationGeometry";

class FakeViewport {
  constructor(
    public scale: number,
    private pageHeight = 792
  ) {}

  convertToViewportRectangle(rect: number[]): number[] {
    const [x0, y0, x1, y1] = rect;
    return [
      x0 * this.scale,
      (this.pageHeight - y0) * this.scale,
      x1 * this.scale,
      (this.pageHeight - y1) * this.scale,
    ];
  }

  convertToPdfPoint(x: number, y: number): number[] {
    return [x / this.scale, this.pageHeight - y / this.scale];
  }
}

function makeViewport(scale: number): PageViewport {
  return new FakeViewport(scale) as unknown as PageViewport;
}

function freeText(overrides: Partial<Extract<Annotation, { type: "free_text" }>> = {}) {
  const base: Extract<Annotation, { type: "free_text" }> = {
    type: "free_text",
    page: 0,
    rect: [100, 700, 250, 724],
    contents: "Peter",
    style: {
      font_family: "Helvetica",
      font_postscript_name: "Helvetica",
      size_pt: 14.4,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      color: [1, 0, 0],
      background: null,
      align: "left",
      vertical_align: "top",
      letter_spacing: 0,
      line_height_multiplier: 1.2,
    },
    background_fill: null,
    border_color: [0, 0, 0],
    border_width: 0,
    auto_resize: false,
  };
  return { ...base, ...overrides };
}

describe("freeTextRenderProps", () => {
  it("renders at the annotation's rect, scaled font size and colour", () => {
    const viewport = makeViewport(2);
    const rendered = freeTextRenderProps(freeText(), viewport);
    expect(rendered).not.toBeNull();
    // Rect: 150pt wide, 24pt tall in PDF points -> doubled on screen at scale 2.
    expect(rendered!.screen.width).toBeCloseTo(300, 5);
    expect(rendered!.screen.height).toBeCloseTo(48, 5);
    // Font size: 14.4pt * scale 2 = 28.8px.
    expect(rendered!.fontSizePx).toBeCloseTo(28.8, 5);
    // Colour: [1, 0, 0] -> pure red.
    expect(rendered!.colorCss).toBe("rgb(255, 0, 0)");
    expect(rendered!.backgroundCss).toBeNull();
  });

  it("carries a background colour when the annotation has one", () => {
    const viewport = makeViewport(1);
    const rendered = freeTextRenderProps(freeText({ background_fill: [0, 1, 0, 0.5] }), viewport);
    expect(rendered!.backgroundCss).toBe("rgba(0, 255, 0, 0.5)");
  });

  it("returns null for a rect with a missing coordinate", () => {
    const viewport = makeViewport(1);
    const rendered = freeTextRenderProps(freeText({ rect: [100, null, 250, 724] }), viewport);
    expect(rendered).toBeNull();
  });
});

describe("toPdfRect / toScreenRect round trip", () => {
  it("recovers the original PDF rect from its screen rect", () => {
    const viewport = makeViewport(1.5);
    const original = freeText().rect as [number, number, number, number];
    const rendered = freeTextRenderProps(freeText(), viewport)!;
    const recovered = toPdfRect(rendered.screen, viewport);
    for (let i = 0; i < 4; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 5);
    }
  });
});

describe("resizeRectEdge (R2, plan 050 D2-UX-3b)", () => {
  const RECT: [number, number, number, number] = [100, 700, 250, 724];

  it("narrows from the left edge: x0 grows, x1 fixed", () => {
    expect(resizeRectEdge(RECT, "left", 150)).toEqual([150, 700, 250, 724]);
  });

  it("widens from the left edge: x0 shrinks, x1 fixed", () => {
    expect(resizeRectEdge(RECT, "left", 50)).toEqual([50, 700, 250, 724]);
  });

  it("resizes from the right edge: x1 moves, x0 fixed", () => {
    expect(resizeRectEdge(RECT, "right", 300)).toEqual([100, 700, 300, 724]);
  });

  it("resizes from the bottom edge: y0 moves, y1 fixed", () => {
    expect(resizeRectEdge(RECT, "bottom", 690)).toEqual([100, 690, 250, 724]);
  });

  it("resizes from the top edge: y1 moves, y0 fixed", () => {
    expect(resizeRectEdge(RECT, "top", 740)).toEqual([100, 700, 250, 740]);
  });

  it("clamps a left-edge drag past the minimum width, never inverting", () => {
    const result = resizeRectEdge(RECT, "left", 245);
    expect(result[0]).toBe(250 - MIN_RESIZE_SIZE_PT);
    expect(result[2]).toBe(250);
    expect(result[0]).toBeLessThan(result[2]);
  });

  it("clamps a right-edge drag past the minimum width, never inverting", () => {
    const result = resizeRectEdge(RECT, "right", 105);
    expect(result[2]).toBe(100 + MIN_RESIZE_SIZE_PT);
    expect(result[0]).toBe(100);
    expect(result[0]).toBeLessThan(result[2]);
  });

  it("clamps a top-edge drag past the minimum height, never inverting", () => {
    const result = resizeRectEdge(RECT, "top", 705);
    expect(result[3]).toBe(700 + MIN_RESIZE_SIZE_PT);
    expect(result[1]).toBeLessThan(result[3]);
  });

  it("clamps a bottom-edge drag past the minimum height, never inverting", () => {
    const result = resizeRectEdge(RECT, "bottom", 720);
    expect(result[1]).toBe(724 - MIN_RESIZE_SIZE_PT);
    expect(result[1]).toBeLessThan(result[3]);
  });
});

// Plan 119 p1c: the resize handles sit on SCREEN sides. Moving a screen side
// and converting back through the viewport keeps the edge right on a rotated
// page, where a screen side is not the PDF edge of the same name.
describe("resizeScreenEdge", () => {
  const SCREEN = { x: 100, y: 200, width: 150, height: 24 };

  it("moves the left side and keeps the right side", () => {
    expect(resizeScreenEdge(SCREEN, "left", 60, 12)).toEqual({ x: 60, y: 200, width: 190, height: 24 });
  });

  it("moves the right side and keeps the left side", () => {
    expect(resizeScreenEdge(SCREEN, "right", 300, 12)).toEqual({ x: 100, y: 200, width: 200, height: 24 });
  });

  it("moves the top side and keeps the bottom side", () => {
    expect(resizeScreenEdge(SCREEN, "top", 180, 12)).toEqual({ x: 100, y: 180, width: 150, height: 44 });
  });

  it("moves the bottom side and keeps the top side", () => {
    expect(resizeScreenEdge(SCREEN, "bottom", 260, 12)).toEqual({ x: 100, y: 200, width: 150, height: 60 });
  });

  it.each([
    ["left", 249, { x: 238, y: 200, width: 12, height: 24 }],
    ["right", 101, { x: 100, y: 200, width: 12, height: 24 }],
    ["top", 223, { x: 100, y: 212, width: 150, height: 12 }],
    ["bottom", 201, { x: 100, y: 200, width: 150, height: 12 }],
  ] as const)("keeps the minimum size when the %s side is dragged across", (side, value, expected) => {
    expect(resizeScreenEdge(SCREEN, side, value, 12)).toEqual(expected);
  });
});

describe("clampRectToPage", () => {
  const PAGE = [0, 0, 612, 792];

  it("leaves a rect inside the page as it is", () => {
    expect(clampRectToPage([100, 600, 200, 624], PAGE)).toEqual([100, 600, 200, 624]);
  });

  it.each([
    ["left", [-40, 600, 200, 624], [0, 600, 200, 624]],
    ["right", [100, 600, 700, 624], [100, 600, 612, 624]],
    ["bottom", [100, -30, 200, 624], [100, 0, 200, 624]],
    ["top", [100, 600, 200, 900], [100, 600, 200, 792]],
  ] as const)("cuts the %s edge at the page box", (_edge, rect, expected) => {
    expect(clampRectToPage(rect, PAGE)).toEqual(expected);
  });

  it("reads a page box with a non-zero origin and swapped corners", () => {
    expect(clampRectToPage([0, 0, 900, 900], [612, 792, 12, 20])).toEqual([12, 20, 612, 792]);
  });
});

describe("colour helpers", () => {
  it("round-trips a hex colour through 0..1 RGB", () => {
    expect(rgb01ToHex(hexToRgb01("#2563eb"))).toBe("#2563eb");
  });

  it("falls back to black for an unparseable hex", () => {
    expect(hexToRgb01("not-a-colour")).toEqual([0, 0, 0]);
  });

  it("defaults alpha to 1 in rgbaToCss when missing", () => {
    expect(rgbaToCss([1, 1, 1])).toBe("rgba(255, 255, 255, 1)");
  });

  it("rgbToCss rounds 0..1 channels to bytes", () => {
    expect(rgbToCss([0, 0, 0])).toBe("rgb(0, 0, 0)");
  });
});
