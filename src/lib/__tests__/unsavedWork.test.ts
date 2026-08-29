import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { hasUnsavedWork, unsavedDocIds, useHasUnsavedWork } from "../unsavedWork";

const DOC_A = "A:\\docs\\a.pdf";
const DOC_B = "A:\\docs\\b.pdf";

const NOTE: Annotation = {
  type: "note",
  page: 0,
  x: 0,
  y: 0,
  contents: "hi",
  icon: "comment",
  color: [0, 0, 0],
};

describe("hasUnsavedWork", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
  });

  it("is false for a document with no tracked edits", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    expect(hasUnsavedWork(DOC_A)).toBe(false);
  });

  it("is false for a document that was never opened", () => {
    expect(hasUnsavedWork(DOC_A)).toBe(false);
  });

  it("is true when the document has a pending annotation (Forms or Annotations)", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useAnnotations.getState().add(DOC_A, NOTE);
    expect(hasUnsavedWork(DOC_A)).toBe(true);
  });

  it("is true when documentStore.dirty is set (the OCR/text-edit draft source)", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useDocuments.getState().markDirty(DOC_A, true);
    expect(hasUnsavedWork(DOC_A)).toBe(true);
  });

  it("does not leak one document's unsaved work onto another", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useDocuments.getState().add({ id: DOC_B, path: DOC_B, pageCount: 1, dirty: false });
    useAnnotations.getState().add(DOC_A, NOTE);
    expect(hasUnsavedWork(DOC_A)).toBe(true);
    expect(hasUnsavedWork(DOC_B)).toBe(false);
  });

  it("clears once the pending annotation is removed", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    const clientId = useAnnotations.getState().add(DOC_A, NOTE);
    expect(hasUnsavedWork(DOC_A)).toBe(true);
    useAnnotations.getState().remove(DOC_A, clientId);
    expect(hasUnsavedWork(DOC_A)).toBe(false);
  });
});

describe("unsavedDocIds", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
  });

  it("lists only the documents with unsaved work", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useDocuments.getState().add({ id: DOC_B, path: DOC_B, pageCount: 1, dirty: false });
    useAnnotations.getState().add(DOC_B, NOTE);
    expect(unsavedDocIds()).toEqual([DOC_B]);
  });

  it("is empty when nothing is open", () => {
    expect(unsavedDocIds()).toEqual([]);
  });

  it("is empty when every open document is clean", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    expect(unsavedDocIds()).toEqual([]);
  });
});

describe("useHasUnsavedWork", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
  });

  it("re-renders true once a pending annotation is added, and false once removed", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    const { result } = renderHook(() => useHasUnsavedWork(DOC_A));
    expect(result.current).toBe(false);

    let clientId = "";
    act(() => {
      clientId = useAnnotations.getState().add(DOC_A, NOTE);
    });
    expect(result.current).toBe(true);

    act(() => {
      useAnnotations.getState().remove(DOC_A, clientId);
    });
    expect(result.current).toBe(false);
  });

  it("re-renders true once documentStore.dirty is set", () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    const { result } = renderHook(() => useHasUnsavedWork(DOC_A));
    expect(result.current).toBe(false);

    act(() => {
      useDocuments.getState().markDirty(DOC_A, true);
    });
    expect(result.current).toBe(true);
  });
});
