// Plan 062 T4.3: filled marks per document. Workspace reads and writes
// this store; autosave serialises it and recovery restores into it.
import { create } from "zustand";
import {
  EMPTY_FILLED_FIELDS,
  type FilledFieldsState,
} from "@/components/workspace/filledFieldsState";

export type FilledFieldsUpdater =
  | FilledFieldsState
  | ((current: FilledFieldsState) => FilledFieldsState);

interface FilledFieldsStore {
  byDoc: Record<string, FilledFieldsState>;
  setFilled: (docPath: string, next: FilledFieldsUpdater) => void;
  restore: (docPath: string, state: FilledFieldsState) => void;
  clear: (docPath: string) => void;
}

function applyFilled(
  byDoc: Record<string, FilledFieldsState>,
  docPath: string,
  next: FilledFieldsUpdater,
): Record<string, FilledFieldsState> {
  const current = byDoc[docPath] ?? EMPTY_FILLED_FIELDS;
  const state = typeof next === "function" ? next(current) : next;
  return { ...byDoc, [docPath]: state };
}

export const useFilledFields = create<FilledFieldsStore>((set) => ({
  byDoc: {},
  setFilled: (docPath, next) =>
    set((current) => ({ byDoc: applyFilled(current.byDoc, docPath, next) })),
  restore: (docPath, state) =>
    set((current) => ({ byDoc: { ...current.byDoc, [docPath]: state } })),
  clear: (docPath) =>
    set((current) => {
      if (current.byDoc[docPath] === undefined) return current;
      const byDoc = { ...current.byDoc };
      delete byDoc[docPath];
      return { byDoc };
    }),
}));

export function filledMarksFor(docPath: string): FilledFieldsState {
  return useFilledFields.getState().byDoc[docPath] ?? EMPTY_FILLED_FIELDS;
}

/** Page overlay ids: empty when the stored key is a different page or document. */
export function filledIdsFor(docPath: string, pageKey: string): Set<string> {
  const state = filledMarksFor(docPath);
  return state.key === pageKey ? state.ids : EMPTY_FILLED_IDS;
}

const EMPTY_FILLED_IDS = new Set<string>();
