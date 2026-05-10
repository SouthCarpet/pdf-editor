import { create } from "zustand";

export type DocId = string;

export interface OpenDocument {
  id: DocId;
  path: string;
  pageCount: number;
  dirty: boolean;
}

interface DocState {
  documents: Map<DocId, OpenDocument>;
  activeDocId: DocId | null;
  add: (doc: OpenDocument) => void;
  setActive: (id: DocId | null) => void;
  markDirty: (id: DocId, dirty: boolean) => void;
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
  close: (id) =>
    set((s) => {
      const m = new Map(s.documents);
      m.delete(id);
      return {
        documents: m,
        activeDocId: s.activeDocId === id ? null : s.activeDocId,
      };
    }),
}));
