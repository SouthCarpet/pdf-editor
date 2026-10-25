// Plan 062 T1.1: the workspace Delete path. Removing a pending FreeText
// that filled a detected field must (1) drop the annotation and (2) clear
// the filled mark so the detected box can be filled again. Oracle: the owner
// 2026-08-29, item 1.
import { describe, expect, it, beforeEach } from "vitest";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { deletePendingAnnotation } from "../deletePending";
import { EMPTY_FILLED_FIELDS, markFieldFilled } from "../filledFieldsState";

type FreeText = Extract<Annotation, { type: "free_text" }>;

const DOC_PATH = "A:\\scans\\timesheet-scan.pdf";
const PAGE_KEY = `${DOC_PATH}\u00000`;

function freeText(): FreeText {
  return {
    type: "free_text",
    page: 0,
    rect: [100, 700, 250, 724],
    contents: "Peter",
    style: {
      font_family: "Helvetica",
      font_postscript_name: "Helvetica",
      size_pt: 12,
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

describe("deletePendingAnnotation", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
  });

  it("removes the pending annotation and clears the filled mark", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    const filled = markFieldFilled(EMPTY_FILLED_FIELDS, PAGE_KEY, "0:0", clientId);

    const next = deletePendingAnnotation({
      remove: (docPath, id) => useAnnotations.getState().remove(docPath, id),
      filled,
      docPath: DOC_PATH,
      pageKey: PAGE_KEY,
      clientId,
    });

    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(0);
    expect(next.ids.has("0:0")).toBe(false);
    expect(next.fieldIdByClientId[clientId]).toBeUndefined();
  });

  it("leaves a neighbour filled field marked when another pending is deleted", () => {
    const first = useAnnotations.getState().add(DOC_PATH, freeText());
    const second = useAnnotations.getState().add(DOC_PATH, freeText());
    let filled = markFieldFilled(EMPTY_FILLED_FIELDS, PAGE_KEY, "0:0", first);
    filled = markFieldFilled(filled, PAGE_KEY, "0:1", second);

    const next = deletePendingAnnotation({
      remove: (docPath, id) => useAnnotations.getState().remove(docPath, id),
      filled,
      docPath: DOC_PATH,
      pageKey: PAGE_KEY,
      clientId: first,
    });

    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(1);
    expect(next.ids.has("0:0")).toBe(false);
    expect(next.ids.has("0:1")).toBe(true);
  });
});
