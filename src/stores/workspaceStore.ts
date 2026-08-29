// Workspace-level transient state: which tool tab is active, which page
// the user is on, and the current zoom factor per open document.
// Persistence belongs to the document store; this one is wiped on app reload.
import { create } from "zustand";

export type WorkspaceTool = "edit" | "organize" | "crop" | "extract" | "ocr" | "compare";
export type EditSubTool = "forms" | "annotations" | "text";

// Plan 060 task T1 (R1): zoom range and step. 25-400% matches the clamp the
// zoom field already had (nothing under a quarter size, nothing past 4x -
// both cheap ways to stop an accidental wheel event blowing the canvas up
// to OOM territory). The 10-point step is the simplest one that still gives
// a keyboard/wheel user a visible change per press without a table of
// "nice" zoom levels to maintain.
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

/** Clamps to [ZOOM_MIN, ZOOM_MAX] and rounds to 2 decimals so repeated
 * +/- 0.1 steps never drift off a round percentage (0.1 + 0.2 !== 0.3). */
export function clampZoom(z: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
}

interface WorkspaceState {
  activeTool: WorkspaceTool;
  /** Sub-tool inside the Edit panel (Phase 12). */
  editSubTool: EditSubTool;
  activePage: number;
  /** Zoom factor (1 = 100%) keyed by document path. A document not present
   * here is at ZOOM_DEFAULT - see `getZoom`. */
  zoomByDoc: Record<string, number>;
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
  /** Plan 062 T1.5: left page panel collapsed. Session-only (this store
   * is wiped on reload). */
  thumbnailStripCollapsed: boolean;
  setTool: (t: WorkspaceTool) => void;
  setEditSubTool: (t: EditSubTool) => void;
  setActivePage: (n: number) => void;
  /** Current zoom for a document, or ZOOM_DEFAULT if it was never set. */
  getZoom: (docId: string) => number;
  setZoom: (docId: string, z: number) => void;
  zoomIn: (docId: string) => void;
  zoomOut: (docId: string) => void;
  resetZoom: (docId: string) => void;
  openOcrPrompt: () => void;
  closeOcrPrompt: () => void;
  requestAutoDetectForms: () => void;
  setThumbnailStripCollapsed: (collapsed: boolean) => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  activeTool: "edit",
  editSubTool: "forms",
  activePage: 0,
  zoomByDoc: {},
  ocrPromptOpen: false,
  autoDetectFormsRequest: 0,
  thumbnailStripCollapsed: false,
  setTool: (t) => set({ activeTool: t }),
  setEditSubTool: (t) => set({ editSubTool: t }),
  setActivePage: (n) => set({ activePage: Math.max(0, n) }),
  getZoom: (docId) => get().zoomByDoc[docId] ?? ZOOM_DEFAULT,
  setZoom: (docId, z) =>
    set((s) => ({ zoomByDoc: { ...s.zoomByDoc, [docId]: clampZoom(z) } })),
  zoomIn: (docId) => get().setZoom(docId, get().getZoom(docId) + ZOOM_STEP),
  zoomOut: (docId) => get().setZoom(docId, get().getZoom(docId) - ZOOM_STEP),
  resetZoom: (docId) => get().setZoom(docId, ZOOM_DEFAULT),
  openOcrPrompt: () => set({ ocrPromptOpen: true }),
  closeOcrPrompt: () => set({ ocrPromptOpen: false }),
  requestAutoDetectForms: () => set((s) => ({ autoDetectFormsRequest: s.autoDetectFormsRequest + 1 })),
  setThumbnailStripCollapsed: (collapsed) => set({ thumbnailStripCollapsed: collapsed }),
}));
