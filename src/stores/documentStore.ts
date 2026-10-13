import { create } from "zustand";
import { useFormDrafts } from "./formDraftStore";

export type DocId = string;

export interface OpenDocument {
  id: DocId;
  path: string;
  pageCount: number;
  dirty: boolean;
  /** Where the shared save flow (`@/lib/documentSave`) last wrote this
   * document's pending edits. `undefined` means "never saved to a chosen
   * path yet" - that is what makes global "Uložiť" behave like "Uložiť
   * ako" the first time (plan 060 task T1, R2). */
  savedPath?: string;
  /** Plan 119 p1: counts successful saves. A save to the same path keeps
   * `savedPath`, so the viewer reloads on this number, not on the path. */
  savedRevision?: number;
}

interface DocState {
  documents: Map<DocId, OpenDocument>;
  activeDocId: DocId | null;
  add: (doc: OpenDocument) => void;
  setActive: (id: DocId | null) => void;
  markDirty: (id: DocId, dirty: boolean) => void;
  setSavedPath: (id: DocId, path: string) => void;
  close: (id: DocId) => void;
}

export const useDocuments = create<DocState>((set) => ({
  documents: new Map(),
  activeDocId: null,
  add: (doc) =>
    set((s) => {
      const m = new Map(s.documents);
      m.set(doc.id, doc);
      return { documents: m, activeDocId: doc.id };
    }),
  setActive: (id) => set({ activeDocId: id }),
  markDirty: (id, dirty) =>
    set((s) => {
      const m = new Map(s.documents);
      const d = m.get(id);
      if (d) m.set(id, { ...d, dirty });
      return { documents: m };
    }),
  setSavedPath: (id, path) =>
    set((s) => {
      const m = new Map(s.documents);
      const d = m.get(id);
      if (d) m.set(id, { ...d, savedPath: path, savedRevision: (d.savedRevision ?? 0) + 1 });
      return { documents: m };
    }),
  close: (id) => {
    // Plan 119 p1c: typed AcroForm values belong to the open document.
    useFormDrafts.getState().clear(id);
    set((s) => {
      const m = new Map(s.documents);
      m.delete(id);
      return {
        documents: m,
        activeDocId: s.activeDocId === id ? null : s.activeDocId,
      };
    });
  },
}));
