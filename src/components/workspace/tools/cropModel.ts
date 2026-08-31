// Plan 062 T5.2: pure crop-rectangle math in page points (the overlay's
// 1:1 canvas space). Resize reuses D2-UX-3 `resizeRectEdge`: that helper's
// [x0, y0, x1, y1] has y0 as the smaller coordinate, so a screen-space
// north (top) edge maps to its "bottom" edge and south to its "top".
import {
  MIN_RESIZE_SIZE_PT,
  resizeRectEdge,
  type ResizeEdge,
} from "../pendingAnnotationGeometry";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropPage {
  width: number;
  height: number;
}

export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type CropAnchor = "center" | "topLeft";

export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const MIN_CROP_SIZE_PT = MIN_RESIZE_SIZE_PT;

export const CROP_HANDLE_CURSOR: Record<CropHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

export const CROP_PREVIEW_BOX = { width: 200, height: 260 };

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

export function ptToMm(pt: number): number {
  return (pt / PT_PER_INCH) * MM_PER_INCH;
}

export function cropRectsEqual(a: CropRect, b: CropRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Uniformly scale a crop rectangle. The stored crop rect lives in PDF
 * points (page-base scale, like `basePageSize`); the overlay renders and
 * drags in on-screen pixels at the current zoom. `scaleCropRect(rect,
 * zoom)` converts points to screen; `scaleCropRect(rect, 1 / zoom)`
 * converts back. Kept as one symmetric helper instead of two named ones.
 */
export function scaleCropRect(rect: CropRect, factor: number): CropRect {
  return {
    x: rect.x * factor,
    y: rect.y * factor,
    width: rect.width * factor,
    height: rect.height * factor,
  };
}

function toTuple(rect: CropRect): [number, number, number, number] {
  return [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
}

function fromTuple(tuple: readonly [number, number, number, number]): CropRect {
  return {
    x: tuple[0],
    y: tuple[1],
    width: tuple[2] - tuple[0],
    height: tuple[3] - tuple[1],
  };
}

function minSizeForPage(page: CropPage, minSize: number): { minW: number; minH: number } {
  return {
    minW: Math.min(Math.max(minSize, 0), Math.max(page.width, 0)),
    minH: Math.min(Math.max(minSize, 0), Math.max(page.height, 0)),
  };
}

/** Clamp a crop rectangle to the page. Size is kept when it already fits. */
export function clampCropRect(
  rect: CropRect,
  page: CropPage,
  minSize: number = MIN_CROP_SIZE_PT,
): CropRect {
  if (page.width <= 0 || page.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const { minW, minH } = minSizeForPage(page, minSize);
  const width = Math.min(Math.max(rect.width, minW), page.width);
  const height = Math.min(Math.max(rect.height, minH), page.height);
  const x = Math.min(Math.max(rect.x, 0), page.width - width);
  const y = Math.min(Math.max(rect.y, 0), page.height - height);
  return { x, y, width, height };
}

function clampResizedTuple(
  tuple: readonly [number, number, number, number],
  handle: CropHandle,
  page: CropPage,
  minSize: number,
): CropRect {
  if (page.width <= 0 || page.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const { minW, minH } = minSizeForPage(page, minSize);
  let x0 = tuple[0];
  let y0 = tuple[1];
  let x1 = tuple[2];
  let y1 = tuple[3];
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(page.width, x1);
  y1 = Math.min(page.height, y1);
  if (x1 - x0 < minW) {
    if (handle.includes("w")) {
      x0 = x1 - minW;
      if (x0 < 0) {
        x0 = 0;
        x1 = minW;
      }
    } else {
      x1 = x0 + minW;
      if (x1 > page.width) {
        x1 = page.width;
        x0 = page.width - minW;
      }
    }
  }
  if (y1 - y0 < minH) {
    if (handle.includes("n")) {
      y0 = y1 - minH;
      if (y0 < 0) {
        y0 = 0;
        y1 = minH;
      }
    } else {
      y1 = y0 + minH;
      if (y1 > page.height) {
        y1 = page.height;
        y0 = page.height - minH;
      }
    }
  }
  return fromTuple([x0, y0, x1, y1]);
}

const SCREEN_TO_EDGE: Record<"n" | "s" | "e" | "w", { edge: ResizeEdge; axis: "x" | "y" }> = {
  w: { edge: "left", axis: "x" },
  e: { edge: "right", axis: "x" },
  n: { edge: "bottom", axis: "y" },
  s: { edge: "top", axis: "y" },
};

function involvedSides(handle: CropHandle): Array<"n" | "s" | "e" | "w"> {
  const sides: Array<"n" | "s" | "e" | "w"> = [];
  if (handle.includes("n")) sides.push("n");
  if (handle.includes("s")) sides.push("s");
  if (handle.includes("e")) sides.push("e");
  if (handle.includes("w")) sides.push("w");
  return sides;
}

export function resizeCropRect(
  rect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  page: CropPage,
  minSize: number = MIN_CROP_SIZE_PT,
): CropRect {
  let tuple = toTuple(rect);
  for (const side of involvedSides(handle)) {
    const { edge, axis } = SCREEN_TO_EDGE[side];
    const value = axis === "x" ? (side === "w" ? rect.x + dx : rect.x + rect.width + dx) : side === "n" ? rect.y + dy : rect.y + rect.height + dy;
    tuple = resizeRectEdge(tuple, edge, value);
  }
  return clampResizedTuple(tuple, handle, page, minSize);
}

export function moveCropRect(rect: CropRect, dx: number, dy: number, page: CropPage): CropRect {
  const width = Math.min(rect.width, Math.max(page.width, 0));
  const height = Math.min(rect.height, Math.max(page.height, 0));
  return clampCropRect({ x: rect.x + dx, y: rect.y + dy, width, height }, page, 0);
}

export function fromPercent(
  page: CropPage,
  widthPct: number,
  heightPct: number,
  anchor: CropAnchor = "center",
  minSize: number = MIN_CROP_SIZE_PT,
): CropRect {
  const width = (page.width * widthPct) / 100;
  const height = (page.height * heightPct) / 100;
  if (anchor === "topLeft") {
    return clampCropRect({ x: 0, y: 0, width, height }, page, minSize);
  }
  const clamped = clampCropRect({ x: 0, y: 0, width, height }, page, minSize);
  return {
    x: (page.width - clamped.width) / 2,
    y: (page.height - clamped.height) / 2,
    width: clamped.width,
    height: clamped.height,
  };
}

export function presetA4(page: CropPage, minSize: number = MIN_CROP_SIZE_PT): CropRect {
  const portrait = page.height >= page.width;
  const widthMm = portrait ? A4_WIDTH_MM : A4_HEIGHT_MM;
  const heightMm = portrait ? A4_HEIGHT_MM : A4_WIDTH_MM;
  return fromPercent(
    page,
    page.width === 0 ? 100 : (mmToPt(widthMm) / page.width) * 100,
    page.height === 0 ? 100 : (mmToPt(heightMm) / page.height) * 100,
    "center",
    minSize,
  );
}

export function presetMargins(
  page: CropPage,
  mm: number,
  minSize: number = MIN_CROP_SIZE_PT,
): CropRect {
  const { minW, minH } = minSizeForPage(page, minSize);
  const inset = Math.max(0, mmToPt(mm));
  const insetX = Math.min(inset, Math.max(0, (page.width - minW) / 2));
  const insetY = Math.min(inset, Math.max(0, (page.height - minH) / 2));
  return {
    x: insetX,
    y: insetY,
    width: page.width - 2 * insetX,
    height: page.height - 2 * insetY,
  };
}

export function presetFullPage(page: CropPage): CropRect {
  return {
    x: 0,
    y: 0,
    width: Math.max(page.width, 0),
    height: Math.max(page.height, 0),
  };
}

export interface CropDisplay {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  widthPct: number;
  heightPct: number;
}

export function toDisplay(rect: CropRect, page: CropPage): CropDisplay {
  return {
    xMm: ptToMm(rect.x),
    yMm: ptToMm(rect.y),
    widthMm: ptToMm(rect.width),
    heightMm: ptToMm(rect.height),
    widthPct: page.width === 0 ? 0 : (rect.width / page.width) * 100,
    heightPct: page.height === 0 ? 0 : (rect.height / page.height) * 100,
  };
}

export interface CropHandlePosition {
  handle: CropHandle;
  x: number;
  y: number;
}

export function cropHandlePositions(rect: CropRect): CropHandlePosition[] {
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  return [
    { handle: "nw", x: rect.x, y: rect.y },
    { handle: "n", x: midX, y: rect.y },
    { handle: "ne", x: rect.x + rect.width, y: rect.y },
    { handle: "e", x: rect.x + rect.width, y: midY },
    { handle: "se", x: rect.x + rect.width, y: rect.y + rect.height },
    { handle: "s", x: midX, y: rect.y + rect.height },
    { handle: "sw", x: rect.x, y: rect.y + rect.height },
    { handle: "w", x: rect.x, y: midY },
  ];
}

export interface CropPreviewClip {
  fittedWidth: number;
  fittedHeight: number;
  scale: number;
  clipX: number;
  clipY: number;
  clipWidth: number;
  clipHeight: number;
  inset: { top: number; right: number; bottom: number; left: number };
}

/** Clip of `rect` on a page contain-fitted into `box` (PdfViewer `fitBox`). */
export function cropPreviewClip(
  rect: CropRect,
  page: CropPage,
  box: { width: number; height: number },
): CropPreviewClip {
  if (page.width <= 0 || page.height <= 0 || box.width <= 0 || box.height <= 0) {
    return {
      fittedWidth: 0,
      fittedHeight: 0,
      scale: 0,
      clipX: 0,
      clipY: 0,
      clipWidth: 0,
      clipHeight: 0,
      inset: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }
  const scale = Math.min(box.width / page.width, box.height / page.height);
  const fittedWidth = page.width * scale;
  const fittedHeight = page.height * scale;
  const clipX = rect.x * scale;
  const clipY = rect.y * scale;
  const clipWidth = rect.width * scale;
  const clipHeight = rect.height * scale;
  return {
    fittedWidth,
    fittedHeight,
    scale,
    clipX,
    clipY,
    clipWidth,
    clipHeight,
    inset: {
      top: clipY,
      right: fittedWidth - clipX - clipWidth,
      bottom: fittedHeight - clipY - clipHeight,
      left: clipX,
    },
  };
}
