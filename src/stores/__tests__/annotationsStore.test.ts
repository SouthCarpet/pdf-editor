// Plan 050 task D2-UX (R5): `add` returns the new client id so a caller can
// select the item it just created, and `update`/`remove` are the two
// operations the pending-annotation control strip drives.
import { describe, it, expect, beforeEach } from "vitest";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "../annotationsStore";

type FreeText = Extract<Annotation, { type: "free_text" }>;

const DOC_PATH = "A:\\scans\\hodiny.pdf";

function freeText(overrides: Partial<FreeText> = {}): FreeText {
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
    ...overrides,
  };
}

function storedFreeText(index = 0): FreeText {
  return useAnnotations.getState().byDoc[DOC_PATH][index] as FreeText;
}

describe("annotationsStore", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
  });

  it("add appears with the given rect, size and colour, and returns its client id", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    const stored = useAnnotations.getState().byDoc[DOC_PATH];
    expect(stored).toHaveLength(1);
    expect(stored[0].__clientId).toBe(clientId);
    expect(storedFreeText().rect).toEqual([100, 700, 250, 724]);
    expect(storedFreeText().style.size_pt).toBe(12);
    expect(storedFreeText().style.color).toEqual([0, 0, 0]);
  });

  it("update changes the font size of the pending annotation in place", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    const before = storedFreeText();
    useAnnotations.getState().update(DOC_PATH, clientId, {
      style: { ...before.style, size_pt: 20 },
    });
    const after = storedFreeText();
    expect(after.style.size_pt).toBe(20);
    // Nothing else on the annotation moved.
    expect(after.rect).toEqual(before.rect);
    expect(after.contents).toBe(before.contents);
  });

  it("update changes the colour of the pending annotation in place", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    const before = storedFreeText();
    useAnnotations.getState().update(DOC_PATH, clientId, {
      style: { ...before.style, color: [1, 0, 0] },
    });
    expect(storedFreeText().style.color).toEqual([1, 0, 0]);
  });

  it("remove deletes the pending annotation", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(1);
    useAnnotations.getState().remove(DOC_PATH, clientId);
    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(0);
  });

  it("update on an unknown client id leaves the list unchanged", () => {
    useAnnotations.getState().add(DOC_PATH, freeText());
    useAnnotations.getState().update(DOC_PATH, "does-not-exist", { contents: "x" });
    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(1);
    expect(storedFreeText().contents).toBe("Peter");
  });
});
