import { createStore } from "zustand/vanilla";

export const HISTORY_LIMIT = 100;

export interface HistoryEntry {
  label: string;
  undo: () => void;
  redo: () => void;
}

export interface DocumentHistory {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
  /** Changes whenever the stack changes, including undo and redo. */
  version: number;
}

export const EMPTY_DOCUMENT_HISTORY: DocumentHistory = Object.freeze({
  undo: Object.freeze([]) as unknown as HistoryEntry[],
  redo: Object.freeze([]) as unknown as HistoryEntry[],
  version: 0,
}) as DocumentHistory;

interface HistoryState {
  byDoc: Record<string, DocumentHistory>;
  push: (docPath: string, entry: HistoryEntry) => void;
  undo: (docPath: string) => void;
  redo: (docPath: string) => void;
  canUndo: (docPath: string) => boolean;
  canRedo: (docPath: string) => boolean;
  clear: (docPath: string) => void;
}

function documentHistory(state: HistoryState, docPath: string): DocumentHistory {
  return state.byDoc[docPath] ?? EMPTY_DOCUMENT_HISTORY;
}

export const historyStore = createStore<HistoryState>((set, get) => ({
  byDoc: {},
  push: (docPath, entry) =>
    set((state) => {
      const current = documentHistory(state, docPath);
      return {
        byDoc: {
          ...state.byDoc,
          [docPath]: {
            undo: [...current.undo, entry].slice(-HISTORY_LIMIT),
            redo: [],
            version: current.version + 1,
          },
        },
      };
    }),
  undo: (docPath) => {
    const current = documentHistory(get(), docPath);
    const entry = current.undo.at(-1);
    if (entry === undefined) return;
    entry.undo();
    set((state) => {
      const latest = documentHistory(state, docPath);
      return {
        byDoc: {
          ...state.byDoc,
          [docPath]: {
            undo: latest.undo.slice(0, -1),
            redo: [...latest.redo, entry],
            version: latest.version + 1,
          },
        },
      };
    });
  },
  redo: (docPath) => {
    const current = documentHistory(get(), docPath);
    const entry = current.redo.at(-1);
    if (entry === undefined) return;
    entry.redo();
    set((state) => {
      const latest = documentHistory(state, docPath);
      return {
        byDoc: {
          ...state.byDoc,
          [docPath]: {
            undo: [...latest.undo, entry].slice(-HISTORY_LIMIT),
            redo: latest.redo.slice(0, -1),
            version: latest.version + 1,
          },
        },
      };
    });
  },
  canUndo: (docPath) => documentHistory(get(), docPath).undo.length > 0,
  canRedo: (docPath) => documentHistory(get(), docPath).redo.length > 0,
  clear: (docPath) =>
    set((state) => {
      if (state.byDoc[docPath] === undefined) return state;
      const byDoc = { ...state.byDoc };
      delete byDoc[docPath];
      return { byDoc };
    }),
}));
