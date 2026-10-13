// Plan 119 p1c: AcroForm values the user typed and no save wrote yet, as the
// page shows them. The file still holds the old value, and the page view
// draws the file, so the typed value is drawn on top at the widget's
// rectangle, the way pending FreeText values are.
//
// Radio groups are not drawn: the field has one rectangle (its first
// widget), and the selected button is another widget. The panel still shows
// the choice. A signature or push button is never editable, so it never
// reaches the draft.
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { dirtyFormDraft, type FormDraft, type FormPlace } from "@/stores/formDraftStore";

export interface PendingFormValue {
  fieldId: string;
  /** Zero-based page index. */
  page: number;
  /** The widget rectangle in PDF points, `[x0, y0, x1, y1]`. */
  rect: FormPlace["rect"];
  /** What to draw. Empty: a cover over the old appearance. */
  text: string;
}

const CHECK_MARK = "✓";

function previewText(kind: FormPlace["kind"], value: string | null): string | null {
  switch (kind) {
    case "text":
    case "choice":
      return value ?? "";
    case "checkbox":
      return value !== null && value !== "Off" ? CHECK_MARK : "";
    default:
      return null;
  }
}

/** The typed values no save wrote, with the page and rectangle each draws at. */
export function pendingFormValues(draft: FormDraft): PendingFormValue[] {
  const dirty = dirtyFormDraft(draft);
  return Object.entries(dirty.values).flatMap(([fieldId, value]) => {
    const place = dirty.places[fieldId];
    if (place === undefined || place.page_index === null) return [];
    const text = previewText(place.kind, value);
    return text === null ? [] : [{ fieldId, page: place.page_index, rect: place.rect, text }];
  });
}

/** True when the page has a value the preview draws: a pending FreeText or
 * stamp, or a typed AcroForm value. */
export function pageHasPendingValue(
  annotations: readonly ClientAnnotation[],
  formValues: readonly PendingFormValue[],
  page: number,
): boolean {
  return (
    annotations.some((a) => (a.type === "free_text" || a.type === "stamp") && a.page === page) ||
    formValues.some((value) => value.page === page)
  );
}
