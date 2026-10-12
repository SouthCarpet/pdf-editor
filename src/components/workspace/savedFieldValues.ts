// Plan 119 p1: which detected cells already hold a saved value.
//
// A save writes each value as a FreeText annotation over its cell and then
// clears the pending state, so the "filled" marks of the session are gone.
// The saved copy still knows: a cell is filled when a FreeText annotation's
// centre lies inside it. The centre, not an exact rect match, so a value the
// user moved or resized inside its cell still counts.
//
// Plan 119 p1b: a click on such a cell edits the saved value. The edit
// needs the value's text, size and PDF object, so the save can replace the
// old annotation instead of adding a second one on top.
import type { AnnotationRef, DetectedFormField } from "@/bindings";

export type PdfRect = [number, number, number, number];

/** The subset of a pdf.js annotation this needs (`page.getAnnotations()`). */
export interface PdfAnnotationData {
  subtype?: string;
  rect?: number[];
  /** `"12R"` for object 12, generation 0; `"12R3"` for generation 3. */
  id?: string;
  contentsObj?: { str?: string };
  defaultAppearanceData?: { fontSize?: number };
}

export interface SavedFreeText {
  rect: PdfRect;
  contents: string;
  sizePt: number | null;
  /** Null when the annotation is not an object of its own (cannot be replaced). */
  ref: AnnotationRef | null;
}

export function savedFreeTexts(annotations: readonly PdfAnnotationData[]): SavedFreeText[] {
  return annotations.flatMap((annotation) =>
    annotation.subtype === "FreeText" && annotation.rect?.length === 4
      ? [
          {
            rect: annotation.rect as PdfRect,
            contents: annotation.contentsObj?.str ?? "",
            sizePt: annotation.defaultAppearanceData?.fontSize ?? null,
            ref: annotationRefFromPdfjsId(annotation.id),
          },
        ]
      : []
  );
}

export function annotationRefFromPdfjsId(id: string | undefined): AnnotationRef | null {
  const match = /^(\d+)R(\d*)$/.exec(id ?? "");
  if (match === null) return null;
  return { object: Number(match[1]), generation: match[2] === "" ? 0 : Number(match[2]) };
}

export function pdfjsAnnotationId({ object, generation }: AnnotationRef): string {
  return generation === 0 ? `${object}R` : `${object}R${generation}`;
}

export function savedValueInField(
  field: DetectedFormField,
  saved: readonly SavedFreeText[]
): SavedFreeText | undefined {
  return saved.find((value) => centreInside(field.rect, value.rect));
}

export function fieldsWithSavedValues(
  fields: readonly DetectedFormField[],
  valueRects: readonly PdfRect[]
): Set<string> {
  return new Set(
    fields
      .filter((field) => valueRects.some((rect) => centreInside(field.rect, rect)))
      .map((field) => field.id)
  );
}

function centreInside(field: (number | null)[], [x0, y0, x1, y1]: PdfRect): boolean {
  return contains(field, (x0 + x1) / 2, (y0 + y1) / 2);
}

function contains(rect: (number | null)[], x: number, y: number): boolean {
  const [x0, y0, x1, y1] = rect;
  if (x0 === null || y0 === null || x1 === null || y1 === null) return false;
  return (
    x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)
  );
}
