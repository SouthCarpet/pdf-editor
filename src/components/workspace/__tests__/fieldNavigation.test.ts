// Oracle: Plan 062 T2.1 R6 requires Tab from A to select B and create B's pending fill.
import { beforeEach, describe, expect, it } from "vitest";
import type { Annotation, DetectedFormField } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { selectAdjacentField } from "../fieldNavigation";
import { EMPTY_FILLED_FIELDS, markFieldFilled } from "../filledFieldsState";

const DOC_PATH = "A:\\scans\\hodiny.pdf";
const PAGE_KEY = `${DOC_PATH}\u00000`;

function field(id: string, x: number): DetectedFormField {
  return {
    id,
    page_index: 0,
    rect: [x, 700, x + 60, 720],
    kind: "box",
    confidence: 0.9,
  };
}

function pending(contents: string): Annotation {
  return {
    type: "free_text",
    page: 0,
    rect: [20, 700, 80, 720],
    contents,
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
      letter_spacing: 0,
      line_height_multiplier: 1.2,
    },
    background_fill: null,
    border_color: [0, 0, 0],
    border_width: 0,
    auto_resize: false,
  };
}

describe("selectAdjacentField", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
  });

  it("selects field B and creates its pending annotation when Tab starts on field A", () => {
    const fieldA = field("A", 20);
    const fieldB = field("B", 120);
    const clientA = useAnnotations.getState().add(DOC_PATH, pending("Peter"));
    const filled = markFieldFilled(EMPTY_FILLED_FIELDS, PAGE_KEY, fieldA.id, clientA);

    const selection = selectAdjacentField({
      fields: [fieldB, fieldA],
      currentId: fieldA.id,
      direction: "next",
      filled,
      pageKey: PAGE_KEY,
      docPath: DOC_PATH,
      addAnnotation: useAnnotations.getState().add,
    });

    expect(selection?.field.id).toBe("B");
    expect(selection?.clientId).toBeDefined();
    expect(selection?.filled.ids.has("B")).toBe(true);
    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(2);
    const created = useAnnotations.getState().byDoc[DOC_PATH]?.[1];
    expect(created?.type).toBe("free_text");
    if (created?.type !== "free_text") throw new Error("expected a pending FreeText annotation");
    expect(created.contents).toBe("");
  });
});
