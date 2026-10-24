// Oracle: Plan 062 T2.1 R6 requires Tab from A to select B and create B's pending fill.
import { beforeEach, describe, expect, it } from "vitest";
import type { Annotation, DetectedFormField } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { selectAdjacentField, selectDetectedField } from "../fieldNavigation";
import { EMPTY_FILLED_FIELDS, markFieldFilled } from "../filledFieldsState";

const DOC_PATH = "A:\\scans\\timesheet-scan.pdf";
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

describe("selectDetectedField", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
  });

  const savedValue = {
    rect: [22, 702, 70, 716] as [number, number, number, number],
    contents: "07:00",
    sizePt: 9,
    ref: { object: 12, generation: 0 },
  };

  function select(fieldA: DetectedFormField, filled = EMPTY_FILLED_FIELDS, pageKey = PAGE_KEY) {
    return selectDetectedField({
      field: fieldA,
      filled,
      pageKey,
      docPath: DOC_PATH,
      addAnnotation: useAnnotations.getState().add,
      saved: [savedValue],
    });
  }

  // Plan 119 p1b defect 1: a click on a cell with a saved value added an
  // empty value on top of it. It now edits the saved value.
  it("edits the saved value of a cell instead of adding a second one", () => {
    const selection = select(field("A", 20));

    const list = useAnnotations.getState().byDoc[DOC_PATH] ?? [];
    expect(list).toHaveLength(1);
    const edit = list[0];
    if (edit?.type !== "free_text") throw new Error("expected a pending FreeText annotation");
    expect(edit.contents).toBe("07:00");
    expect(edit.rect).toEqual(savedValue.rect);
    expect(edit.style.size_pt).toBe(9);
    expect(edit.__replaces).toEqual({ object: 12, generation: 0 });
    expect(selection.filled.ids.has("A")).toBe(true);
  });

  it("a second click on the same cell selects the same edit", () => {
    const first = select(field("A", 20));
    const second = select(field("A", 20), first.filled);

    expect(second.clientId).toBe(first.clientId);
    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(1);
  });

  it("a click on a cell filled before a page switch selects its pending value", () => {
    const first = select(field("A", 20));
    const otherPage = { ...first.filled, key: `${DOC_PATH}\u00001` };

    const again = select(field("A", 20), otherPage);

    expect(again.clientId).toBe(first.clientId);
    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(1);
  });

  it("a cell with no saved value still gets an empty value", () => {
    const selection = select(field("B", 120));

    const created = useAnnotations.getState().byDoc[DOC_PATH]?.[0];
    if (created?.type !== "free_text") throw new Error("expected a pending FreeText annotation");
    expect(created.contents).toBe("");
    expect(created.__replaces).toBeUndefined();
    expect(selection.filled.ids.has("B")).toBe(true);
  });
});
