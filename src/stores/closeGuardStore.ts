// Plan 050 task D2-UX-2 (R2/R3): shared state for the "Neuložené zmeny"
// dialog. One request at a time - a second close attempt while the dialog
// is open just re-shows the same one instead of stacking dialogs.
import { create } from "zustand";
import type { DocId } from "./documentStore";

export type CloseGuardRequest =
  | { kind: "window"; docIds: DocId[] }
  | { kind: "tab"; docId: DocId; onClosed: () => void }
  // Plan 119: the Update button asks before the setup closes the app.
  | { kind: "update"; docIds: DocId[]; onClosed: () => void };

interface CloseGuardState {
  request: CloseGuardRequest | null;
  open: (request: CloseGuardRequest) => void;
  dismiss: () => void;
}

export const useCloseGuard = create<CloseGuardState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  dismiss: () => set({ request: null }),
}));
