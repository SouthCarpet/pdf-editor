// Plan 050 task D2-UX: pure helpers for the pending-FreeText live preview.
//
// Kept separate from `detectedFieldGeometry.ts` (which only knows about
// `DetectedFormField`): this file is about rendering an `Annotation` of
// type `free_text` that is already sitting in the annotations store, plus
// converting a dragged/resized on-screen rectangle back to a PDF /Rect.
// Pure functions so the rect/size/colour math is testable without mounting
// a Konva canvas, which jsdom cannot render.
import type { PageViewport } from "pdfjs-dist";
import type { Annotation } from "@/bindings";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";

export type FreeTextAnnotation = Extract<Annotation, { type: "free_text" }>;

export interface FreeTextRenderProps {
  screen: ScreenRect;
  fontSizePx: number;
  colorCss: string;
  backgroundCss: string | null;
}

function channel(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 255);
}

/** 0..1 RGB tuple (the wire format) to a CSS `rgb()` string. */
export function rgbToCss(color: readonly (number | null)[]): string {
  const [r, g, b] = color;
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

/** 0..1 RGBA tuple to a CSS `rgba()` string; missing alpha defaults to 1. */
export function rgbaToCss(color: readonly (number | null)[]): string {
  const [r, g, b, a] = color;
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${a ?? 1})`;
}

/** "#rrggbb" to a 0..1 RGB tuple; an unparseable hex falls back to black. */
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex.replace(/^#/, ""));
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/** 0..1 RGB tuple to "#rrggbb". */
export function rgb01ToHex(color: readonly (number | null)[]): string {
  const toByte = (v: number | null | undefined) => channel(v).toString(16).padStart(2, "0");
  const [r, g, b] = color;
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/**
 * Everything a Konva render pass needs for one pending FreeText annotation:
 * where it sits on screen, how big the text is in screen pixels, and its
 * colours - in the exact values that will be written to the saved PDF.
 * Returns null when the rect has a missing coordinate (mirrors
 * `toScreenRect`, which the saved PDF would also reject as undrawable).
 */
export function freeTextRenderProps(
  annotation: FreeTextAnnotation,
  viewport: PageViewport,
): FreeTextRenderProps | null {
  const screen = toScreenRect(annotation.rect, viewport);
  if (screen === null) return null;
  return {
    screen,
    fontSizePx: (annotation.style.size_pt ?? 12) * viewport.scale,
    colorCss: rgbToCss(annotation.style.color),
    backgroundCss: annotation.background_fill ? rgbaToCss(annotation.background_fill) : null,
  };
}

/**
 * Inverse of `toScreenRect`: on-screen pixels back to a PDF /Rect in
 * points, through the same viewport (so the Y flip, rotation and MediaBox
 * origin invert the same way they were applied). Used when the user drags
 * or resizes a pending annotation's overlay handles.
 */
export function toPdfRect(
  screen: ScreenRect,
  viewport: PageViewport,
): [number, number, number, number] {
  const [px0, py0] = viewport.convertToPdfPoint(screen.x, screen.y);
  const [px1, py1] = viewport.convertToPdfPoint(screen.x + screen.width, screen.y + screen.height);
  return [Math.min(px0, px1), Math.min(py0, py1), Math.max(px0, px1), Math.max(py0, py1)];
}

/** One edge of a pending FreeText annotation's rectangle. */
export type ResizeEdge = "left" | "right" | "top" | "bottom";

/**
 * Minimum width AND height a pending FreeText rectangle may be resized to,
 * in PDF points (plan 050 D2-UX-3b, R2). One constant for both dimensions:
 * small enough to still narrow a wide detected field, large enough to stay
 * a usable target.
 */
export const MIN_RESIZE_SIZE_PT = 12;

/**
 * Move one edge of a PDF /Rect (`[x0, y0, x1, y1]`, `toPdfRect`'s
 * convention: x0<=x1, y0<=y1, y1 is the top) to a new absolute PDF-point
 * coordinate, keeping the opposite edge fixed. Clamped to
 * `MIN_RESIZE_SIZE_PT` so the rect can shrink but never invert or collapse.
 * Pure: no viewport, no font-size change - the caller decides what to do
 * with the new rect (R2: the font size is never recomputed on resize).
 */
export function resizeRectEdge(
  rect: readonly [number, number, number, number],
  edge: ResizeEdge,
  valuePt: number,
): [number, number, number, number] {
  const [x0, y0, x1, y1] = rect;
  switch (edge) {
    case "left":
      return [Math.min(valuePt, x1 - MIN_RESIZE_SIZE_PT), y0, x1, y1];
    case "right":
      return [x0, y0, Math.max(valuePt, x0 + MIN_RESIZE_SIZE_PT), y1];
    case "bottom":
      return [x0, Math.min(valuePt, y1 - MIN_RESIZE_SIZE_PT), x1, y1];
    case "top":
      return [x0, y0, x1, Math.max(valuePt, y0 + MIN_RESIZE_SIZE_PT)];
  }
}

/**
 * Plan 119 p1b: moves a dragged value back onto the page, keeping its size
 * (a value larger than the page is cut to the page). A value dropped partly
 * off the page would be cut off in the saved file, or lost from view.
 * `pageBox` is the viewport's `viewBox`, `[x0, y0, x1, y1]` in PDF points.
 */
export function keepRectOnPage(
  rect: readonly [number, number, number, number],
  pageBox: readonly number[],
): [number, number, number, number] {
  const [left, bottom, right, top] = [
    Math.min(pageBox[0], pageBox[2]),
    Math.min(pageBox[1], pageBox[3]),
    Math.max(pageBox[0], pageBox[2]),
    Math.max(pageBox[1], pageBox[3]),
  ];
  const width = Math.min(rect[2] - rect[0], right - left);
  const height = Math.min(rect[3] - rect[1], top - bottom);
  const x0 = Math.min(Math.max(rect[0], left), right - width);
  const y0 = Math.min(Math.max(rect[1], bottom), top - height);
  return [x0, y0, x0 + width, y0 + height];
}

/**
 * Plan 119 p1c: moves one SCREEN side of a rectangle to `value` (pixels),
 * keeping the opposite side, and never below `minPx` wide or high. The
 * resize handles sit on screen sides. On a page turned 90 degrees a screen
 * side is not the PDF edge of the same name, so the move is made on screen
 * and the result converted back with `toPdfRect`.
 */
export function resizeScreenEdge(
  screen: ScreenRect,
  side: ResizeEdge,
  value: number,
  minPx: number,
): ScreenRect {
  const right = screen.x + screen.width;
  const bottom = screen.y + screen.height;
  switch (side) {
    case "left": {
      const x = Math.min(value, right - minPx);
      return { ...screen, x, width: right - x };
    }
    case "right":
      return { ...screen, width: Math.max(value, screen.x + minPx) - screen.x };
    case "top": {
      const y = Math.min(value, bottom - minPx);
      return { ...screen, y, height: bottom - y };
    }
    case "bottom":
      return { ...screen, height: Math.max(value, screen.y + minPx) - screen.y };
  }
}

/**
 * Plan 119 p1c: cuts a resized value at the page edge, so no edge of it can
 * leave the page (a value cut off in the saved file, or lost from view).
 * Each coordinate is clamped on its own, so the rect never inverts. Unlike
 * `keepRectOnPage` it does not slide the rect to keep its size: a resize
 * moves one edge only. `pageBox` is the viewport's `viewBox`.
 */
export function clampRectToPage(
  rect: readonly [number, number, number, number],
  pageBox: readonly number[],
): [number, number, number, number] {
  const [left, bottom, right, top] = [
    Math.min(pageBox[0], pageBox[2]),
    Math.min(pageBox[1], pageBox[3]),
    Math.max(pageBox[0], pageBox[2]),
    Math.max(pageBox[1], pageBox[3]),
  ];
  const within = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  return [
    within(rect[0], left, right),
    within(rect[1], bottom, top),
    within(rect[2], left, right),
    within(rect[3], bottom, top),
  ];
}
