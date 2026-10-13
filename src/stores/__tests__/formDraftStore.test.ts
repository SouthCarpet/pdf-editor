// Plan 119 p1c: typed AcroForm values are unsaved work. The store answers
// "is anything typed that no save wrote?" per document.
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  NO_FORM_DRAFT,
  dirtyFormDraft,
  hasDirtyFormDraft,
  isDraftDirty,
  type FormPlace,
  useFormDrafts,
  useHasDirtyFormDraft,
} from "../formDraftStore";

const DOC = "A:\\docs\\form.pdf";
const OTHER = "A:\\docs\\other.pdf";
const PLACE: FormPlace = { kind: "text", page_index: 0, rect: [36, 700, 240, 724] };

describe("formDraftStore dirty state", () => {
  beforeEach(() => {
    useFormDrafts.setState({ byDoc: {} });
  });

  it("a document with no typed value is clean", () => {
    expect(isDraftDirty(NO_FORM_DRAFT)).toBe(false);
    expect(hasDirtyFormDraft(DOC)).toBe(false);
  });

  it("a typed value is dirty until a save wrote it", () => {
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", PLACE);
    expect(hasDirtyFormDraft(DOC)).toBe(true);

    useFormDrafts.getState().markSaved(DOC, { "10:0": "Alice", "11:0": "x" });
    expect(hasDirtyFormDraft(DOC)).toBe(false);
  });

  it("a value typed after the save wrote is dirty again", () => {
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", PLACE);
    useFormDrafts.getState().markSaved(DOC, { "10:0": "Alice" });
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice!", PLACE);
    expect(hasDirtyFormDraft(DOC)).toBe(true);
  });

  it("a cleared field (null) is a change too", () => {
    useFormDrafts.getState().setValue(DOC, "10:0", null, PLACE);
    expect(hasDirtyFormDraft(DOC)).toBe(true);
  });

  it("does not leak one document's draft onto another", () => {
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", PLACE);
    expect(hasDirtyFormDraft(OTHER)).toBe(false);
  });

  it("clear drops the draft of one document only", () => {
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", PLACE);
    useFormDrafts.getState().setValue(OTHER, "10:0", "Bob", PLACE);
    useFormDrafts.getState().clear(DOC);
    expect(hasDirtyFormDraft(DOC)).toBe(false);
    expect(hasDirtyFormDraft(OTHER)).toBe(true);
  });

  it("keeps the field place beside the value, for the page preview", () => {
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", PLACE);
    expect(useFormDrafts.getState().byDoc[DOC]?.places["10:0"]).toEqual(PLACE);
  });

  it("dirtyFormDraft lists only the values no save wrote, with their places", () => {
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", PLACE);
    useFormDrafts.getState().setValue(DOC, "11:0", "Bob", PLACE);
    useFormDrafts.getState().markSaved(DOC, { "10:0": "Alice", "11:0": "Bo" });
    expect(dirtyFormDraft(useFormDrafts.getState().byDoc[DOC] ?? NO_FORM_DRAFT)).toEqual({
      values: { "11:0": "Bob" },
      places: { "11:0": PLACE },
    });
  });

  it("restore puts a stored draft back as unsaved", () => {
    useFormDrafts
      .getState()
      .restore(DOC, { values: { "10:0": "Alice" }, places: { "10:0": PLACE } });
    expect(hasDirtyFormDraft(DOC)).toBe(true);
    expect(useFormDrafts.getState().byDoc[DOC]?.values).toEqual({ "10:0": "Alice" });
  });

  it("useHasDirtyFormDraft follows the store", () => {
    const { result } = renderHook(() => useHasDirtyFormDraft(DOC));
    expect(result.current).toBe(false);
    act(() => useFormDrafts.getState().setValue(DOC, "10:0", "Alice", PLACE));
    expect(result.current).toBe(true);
    act(() => useFormDrafts.getState().clear(DOC));
    expect(result.current).toBe(false);
  });
});
