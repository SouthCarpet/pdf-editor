// Workspace-level transient state: which tool tab is active, which page
// the user is on, and the current zoom factor. Persistence belongs to the
// document store; this one is wiped on app reload.
import { create } from "zustand";

export type WorkspaceTool = "edit" | "organize" | "crop" | "extract" | "ocr" | "compare";
export type EditSubTool = "forms" | "annotations" | "text";

interface WorkspaceState {
  activeTool: WorkspaceTool;
  /** Sub-tool inside the Edit panel (Phase 12). */
  editSubTool: EditSubTool;
  activePage: number;
  zoom: number;
  // Plan 050 task D2-UX (R4): the scanned-page dialog is owned here, not as
  // local `WorkspaceRoute` state, so the Text tool's empty state can open it
  // without threading a callback down through `Workspace`.
  ocrPromptOpen: boolean;
  // A counter, not a boolean: the Text tool's "Nájsť polia" action switches
  // to the Forms sub-tool AND asks it to run detection. Incrementing is a
  // one-shot signal `DetectFieldsSection` can tell apart from "unchanged",
  // even across a mount caused by the same subtool switch. The "already
  // consumed" marker itself lives in a `useRef` owned by `Workspace` (which
  // does not unmount when the Edit sub-tool changes), not here: an effect
  // that calls both a store setter and the async detect call in the same
  // body trips `react-hooks/set-state-in-effect` (verified 2026-08-29,
  // plan 050 D2-UX-2 R7a) - a plain `ref.current` read/write is the
  // pattern that rule already treats as safe.
  autoDetectFormsRequest: number;
  setTool: (t: WorkspaceTool) => void;
  setEditSubTool: (t: EditSubTool) => void;
  setActivePage: (n: number) => void;
  setZoom: (z: number) => void;
  openOcrPrompt: () => void;
  closeOcrPrompt: () => void;
  requestAutoDetectForms: () => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  activeTool: "edit",
  editSubTool: "forms",
  activePage: 0,
  zoom: 1.0,
  ocrPromptOpen: false,
  autoDetectFormsRequest: 0,
  setTool: (t) => set({ activeTool: t }),
  setEditSubTool: (t) => set({ editSubTool: t }),
  setActivePage: (n) => set({ activePage: Math.max(0, n) }),
  // Clamp zoom to a sane range so accidental wheel events can't blow the
  // canvas up to OOM territory.
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(z, 4)) }),
  openOcrPrompt: () => set({ ocrPromptOpen: true }),
  closeOcrPrompt: () => set({ ocrPromptOpen: false }),
  requestAutoDetectForms: () => set((s) => ({ autoDetectFormsRequest: s.autoDetectFormsRequest + 1 })),
}));
