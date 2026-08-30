// Plan 050 task D2: the two conversions the detected-fields UI needs.
//
// They live outside the components so both the overlay and the fill input
// can use them, and so each component file exports only components.
//
// The generated `rect` is `(number | null)[]`: specta models an f32 that
// way, the same as `FormField.rect`. A field with a missing coordinate is
// not drawable, so the conversion returns null instead of guessing a zero.
import type { PageViewport } from "pdfjs-dist";
import type { Annotation, DetectedFormField } from "@/bindings";

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * PDF points to on-screen pixels, through the viewport that already
 * rendered the page: it applies the Y flip, the page rotation and the
 * MediaBox origin. `convertToViewportRectangle` can return the corner pair
 * in either order depending on rotation, so this takes min/max.
 */
export function toScreenRect(rect: (number | null)[], viewport: PageViewport): ScreenRect | null {
  const points = rect.map((value) => value ?? Number.NaN);
  if (points.some((value) => Number.isNaN(value))) return null;
  const [x0, y0, x1, y1] = viewport.convertToViewportRectangle(points);
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

/**
 * One FreeText annotation over the detected rectangle. No background and
 * no border: the field's own border is already printed on the scan, so
 * drawing another one would sit on top of it. `auto_resize` is false
 * because `apply_annotations` never reads it for FreeText.
 */
export function buildFreeText(field: DetectedFormField, contents: string): Annotation {
  const top = field.rect[3] ?? 0;
  const bottom = field.rect[1] ?? 0;
  const heightPt = top - bottom;
  return {
    type: "free_text",
    page: field.page_index,
    rect: field.rect,
    contents,
    style: {
      font_family: "Helvetica",
      font_postscript_name: "Helvetica",
      size_pt: heightPt > 0 ? Math.min(12, heightPt * 0.6) : 12,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      color: [0, 0, 0],
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
}
