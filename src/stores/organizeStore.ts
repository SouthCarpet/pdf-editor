// Plan 062 final fix wave F4: organize staging lives here, not in
// `OrganizePanel`'s own `useState`. History entries pushed while the panel
// is open close over `undo`/`redo` callbacks; when Workspace switches away
// from the Organize tool the panel unmounts, and a callback that called a
// dead `setState` was a silent no-op that still burned an undo/redo slot.
// A module-level Zustand store outlives the panel, so those callbacks keep
// working after the tool switches, exactly like `filledFieldsStore` and
// `annotationsStore` already do for their own per-document state.
import { create } from "zustand";
import type * as pdfjs from "pdfjs-dist";
import type { OrganizeState } from "@/components/workspace/tools/organizeModel";

export interface OrganizeBundle {
  pdf: pdfjs.PDFDocumentProxy;
  org: OrganizeState;
}

interface OrganizeStoreState {
  byDoc: Record<string, OrganizeBundle>;
  setOrg: (docPath: string, pdf: pdfjs.PDFDocumentProxy, org: OrganizeState) => void;
}

export const useOrganizeStore = create<OrganizeStoreState>((set) => ({
  byDoc: {},
  setOrg: (docPath, pdf, org) =>
    set((current) => ({ byDoc: { ...current.byDoc, [docPath]: { pdf, org } } })),
}));
