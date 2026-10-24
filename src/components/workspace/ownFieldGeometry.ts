import type { OwnFieldKind } from "@/bindings";
import { keepRectOnPage, MIN_RESIZE_SIZE_PT } from "./pendingAnnotationGeometry";

type Point = readonly [number, number];
type Rect = [number, number, number, number];

/** Keep the box on the page, preserving its size where the page permits. */
export function clampToPage(rect: readonly [number, number, number, number], pageBox: readonly number[]): Rect {
  return keepRectOnPage(rect, pageBox);
}

/** The click is the top-left corner in PDF space. Near the bottom, grow up. */
export function defaultOwnFieldRect(point: Point, kind: OwnFieldKind, pageBox: readonly number[]): Rect {
  const [x, y] = point;
  const [width, height] = kind === "checkbox" ? [14, 14] : [140, 22];
  const bottom = Math.min(pageBox[1], pageBox[3]);
  const y0 = y - height < bottom ? y : y - height;
  return clampToPage([x, y0, x + width, y0 + height], pageBox);
}

/** Normalize a drag; each short side grows from the start in its drag direction. */
export function drawnOwnFieldRect(start: Point, end: Point): Rect {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const x = start[0] + (dx < 0 ? -1 : 1) * Math.max(Math.abs(dx), MIN_RESIZE_SIZE_PT);
  const y = start[1] + (dy < 0 ? -1 : 1) * Math.max(Math.abs(dy), MIN_RESIZE_SIZE_PT);
  return [Math.min(start[0], x), Math.min(start[1], y), Math.max(start[0], x), Math.max(start[1], y)];
}

/** Suggest a free default name. The PDF writer also checks saved field names. */
export function suggestFieldName(names: readonly string[]): string {
  const used = new Set(names);
  if (!used.has("Field")) return "Field";
  let suffix = 2;
  while (used.has(`Field_${suffix}`)) suffix += 1;
  return `Field_${suffix}`;
}
