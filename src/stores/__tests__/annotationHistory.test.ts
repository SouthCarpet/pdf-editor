import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/bindings";
import {
  clearAnnotationFieldLinks,
  linkAnnotationToFilledField,
  TEXT_EDIT_COALESCE_MS,
} from "../annotationHistory";
import { useAnnotations } from "../annotationsStore";
import { historyStore } from "../historyStore";

type FreeText = Extract<Annotation, { type: "free_text" }>;
type Stamp = Extract<Annotation, { type: "stamp" }>;

const DOC_PATH = "A:\\scans\\timesheet-scan.pdf";

function freeText(overrides: Partial<FreeText> = {}): FreeText {
  return {
    type: "free_text",
    page: 0,
    rect: [100, 700, 250, 724],
    contents: "",
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

function stored(): FreeText & { __clientId: string } {
  return useAnnotations.getState().byDoc[DOC_PATH][0] as FreeText & { __clientId: string };
}

function stamp(): Stamp {
  return {
    type: "stamp",
    page: 0,
    rect: [100, 200, 280, 260],
    image_path: "A:\\signatures\\saved.png",
    scale: 1,
    rotation: 0,
    opacity: 1,
  };
}

describe("annotation history wrapper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T10:00:00Z"));
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    historyStore.setState({ byDoc: {} });
    clearAnnotationFieldLinks(DOC_PATH);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("undoing an add removes the annotation and unmarks its filled field", () => {
    let filled = true;
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    linkAnnotationToFilledField(DOC_PATH, clientId, {
      mark: () => {
        filled = true;
      },
      unmark: () => {
        filled = false;
      },
    });

    historyStore.getState().undo(DOC_PATH);

    expect(useAnnotations.getState().byDoc[DOC_PATH]).toHaveLength(0);
    expect(filled).toBe(false);

    historyStore.getState().redo(DOC_PATH);
    expect(stored().__clientId).toBe(clientId);
    expect(filled).toBe(true);
  });

  it("coalesces text edits for the same annotation within 800 ms", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    useAnnotations.getState().update(DOC_PATH, clientId, { contents: "P" });
    vi.advanceTimersByTime(TEXT_EDIT_COALESCE_MS);
    useAnnotations.getState().update(DOC_PATH, clientId, { contents: "Pe" });

    expect(historyStore.getState().byDoc[DOC_PATH].undo).toHaveLength(2);
    historyStore.getState().undo(DOC_PATH);
    expect(stored().contents).toBe("");
    historyStore.getState().redo(DOC_PATH);
    expect(stored().contents).toBe("Pe");
  });

  it("keeps text edits outside 800 ms as separate undo entries", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    useAnnotations.getState().update(DOC_PATH, clientId, { contents: "P" });
    vi.advanceTimersByTime(TEXT_EDIT_COALESCE_MS + 1);
    useAnnotations.getState().update(DOC_PATH, clientId, { contents: "Pe" });

    expect(historyStore.getState().byDoc[DOC_PATH].undo).toHaveLength(3);
    historyStore.getState().undo(DOC_PATH);
    expect(stored().contents).toBe("P");
  });

  it("undoing a move restores the previous rectangle", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    historyStore.getState().clear(DOC_PATH);

    useAnnotations.getState().update(DOC_PATH, clientId, { rect: [120, 680, 270, 704] });
    expect(historyStore.getState().byDoc[DOC_PATH].undo.at(-1)?.label).toBe("move");

    historyStore.getState().undo(DOC_PATH);
    expect(stored().rect).toEqual([100, 700, 250, 724]);
  });

  it("classifies a rectangle size change as resize", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    historyStore.getState().clear(DOC_PATH);

    useAnnotations.getState().update(DOC_PATH, clientId, { rect: [100, 700, 280, 724] });

    expect(historyStore.getState().byDoc[DOC_PATH].undo.at(-1)?.label).toBe("resize");
  });

  it("undoes a signature stamp resize through the annotation history", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, stamp());
    historyStore.getState().clear(DOC_PATH);

    useAnnotations.getState().update(DOC_PATH, clientId, { rect: [100, 200, 340, 280] });
    expect(historyStore.getState().byDoc[DOC_PATH].undo.at(-1)?.label).toBe("resize");

    historyStore.getState().undo(DOC_PATH);
    expect((useAnnotations.getState().byDoc[DOC_PATH][0] as Stamp).rect).toEqual([
      100, 200, 280, 260,
    ]);
  });

  it("undoing delete restores the same client id", () => {
    const clientId = useAnnotations.getState().add(DOC_PATH, freeText());
    historyStore.getState().clear(DOC_PATH);

    useAnnotations.getState().remove(DOC_PATH, clientId);
    historyStore.getState().undo(DOC_PATH);

    expect(stored().__clientId).toBe(clientId);
  });
});
