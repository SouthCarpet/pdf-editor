// Plan 119 p1: which detected cells already hold a saved value.
//
// A save writes each value as a FreeText annotation over its cell and then
// clears the pending state, so the "filled" marks of the session are gone.
// The saved copy still knows: a cell is filled when a FreeText annotation's
// centre lies inside it. The centre, not an exact rect match, so a value the
// user moved or resized inside its cell still counts.
import type { DetectedFormField } from "@/bindings";

export type PdfRect = [number, number, number, number];

/** The subset of a pdf.js annotation this needs (`page.getAnnotations()`). */
export interface PdfAnnotationData {
  subtype?: string;
  rect?: number[];
}

export function savedFreeTextRects(annotations: readonly PdfAnnotationData[]): PdfRect[] {
  return annotations.flatMap((annotation) =>
    annotation.subtype === "FreeText" && annotation.rect?.length === 4
      ? [annotation.rect as PdfRect]
      : []
  );
}

export function fieldsWithSavedValues(
  fields: readonly DetectedFormField[],
  valueRects: readonly PdfRect[]
): Set<string> {
  const centres = valueRects.map(([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2]);
  return new Set(
    fields
      .filter((field) => centres.some(([x, y]) => contains(field.rect, x, y)))
      .map((field) => field.id)
  );
}

function contains(rect: (number | null)[], x: number, y: number): boolean {
  const [x0, y0, x1, y1] = rect;
  if (x0 === null || y0 === null || x1 === null || y1 === null) return false;
  return (
    x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)
  );
}
