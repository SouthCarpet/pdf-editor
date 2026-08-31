import type { Annotation, DetectedFormField } from "@/bindings";

export type StampAnnotation = Extract<Annotation, { type: "stamp" }>;
export type StampCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const DEFAULT_STAMP_WIDTH_RATIO = 0.3;
export const DETECTED_BOX_INSET_PT = 2;
export const MIN_STAMP_SIZE_PT = 12;

function normalizedAspect(aspectRatio: number): number {
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
}

export function defaultStampRect(
  pageWidth: number,
  pageHeight: number,
  aspectRatio: number,
  center: readonly [number, number],
): [number, number, number, number] {
  const aspect = normalizedAspect(aspectRatio);
  const width = Math.min(pageWidth, pageWidth * DEFAULT_STAMP_WIDTH_RATIO);
  const height = Math.min(pageHeight, width / aspect);
  const x0 = Math.min(Math.max(0, center[0] - width / 2), Math.max(0, pageWidth - width));
  const y0 = Math.min(Math.max(0, center[1] - height / 2), Math.max(0, pageHeight - height));
  return [x0, y0, x0 + width, y0 + height];
}

export function fitStampIntoDetectedBox(
  field: DetectedFormField,
  aspectRatio: number,
): [number, number, number, number] | null {
  if (field.kind !== "box" || field.rect.some((value) => value === null)) return null;
  const [fieldX0, fieldY0, fieldX1, fieldY1] = field.rect as [number, number, number, number];
  const x0 = Math.min(fieldX0, fieldX1) + DETECTED_BOX_INSET_PT;
  const y0 = Math.min(fieldY0, fieldY1) + DETECTED_BOX_INSET_PT;
  const x1 = Math.max(fieldX0, fieldX1) - DETECTED_BOX_INSET_PT;
  const y1 = Math.max(fieldY0, fieldY1) - DETECTED_BOX_INSET_PT;
  const availableWidth = x1 - x0;
  const availableHeight = y1 - y0;
  if (availableWidth <= 0 || availableHeight <= 0) return null;

  const aspect = normalizedAspect(aspectRatio);
  const width = Math.min(availableWidth, availableHeight * aspect);
  const height = width / aspect;
  const left = x0 + (availableWidth - width) / 2;
  const bottom = y0 + (availableHeight - height) / 2;
  return [left, bottom, left + width, bottom + height];
}

export function resizeStampRect(
  rect: readonly [number, number, number, number],
  corner: StampCorner,
  point: readonly [number, number],
  aspectRatio: number,
): [number, number, number, number] {
  const [x0, y0, x1, y1] = rect;
  const oppositeX = corner.endsWith("left") ? x1 : x0;
  const oppositeY = corner.startsWith("bottom") ? y1 : y0;
  const aspect = normalizedAspect(aspectRatio);
  const draggedWidth = Math.abs(point[0] - oppositeX);
  const draggedHeight = Math.abs(point[1] - oppositeY);
  const width = Math.max(
    MIN_STAMP_SIZE_PT,
    draggedWidth / aspect >= draggedHeight ? draggedWidth : draggedHeight * aspect,
  );
  const height = width / aspect;
  const left = corner.endsWith("left") ? oppositeX - width : oppositeX;
  const bottom = corner.startsWith("bottom") ? oppositeY - height : oppositeY;
  return [left, bottom, left + width, bottom + height];
}

export function buildStampAnnotation(
  page: number,
  rect: [number, number, number, number],
  imagePath: string,
): StampAnnotation {
  return {
    type: "stamp",
    page,
    rect,
    image_path: imagePath,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };
}
