// Workspace-level transient state: which tool tab is active, which page
// the user is on, and the current zoom factor per open document.
// Persistence belongs to the document store; this one is wiped on app reload.
import { create } from "zustand";
import { useAppStore } from "@/stores/appStore";

export type WorkspaceTool = "edit" | "organize" | "crop" | "extract" | "ocr" | "compare";
export type EditSubTool = "forms" | "annotations" | "text" | "signature";
export type ZoomMode = "custom" | "fit-width" | "fit-page";

export interface ViewerSize {
  width: number;
  height: number;
}

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

/** Derives the numeric scale for a fit mode. `custom` deliberately has no
 * derived value because its scale is the user's current numeric zoom. */
export function zoomForMode(
  mode: ZoomMode,
  pageSize: ViewerSize,
  boxSize: ViewerSize,
  horizontalGap = 0,
): number | null {
  if (
    mode === "custom" ||
    pageSize.width <= 0 ||
    pageSize.height <= 0 ||
    boxSize.width <= 0 ||
    boxSize.height <= 0
  ) {
    return null;
  }
  const availableWidth = boxSize.width - Math.max(0, horizontalGap);
  if (availableWidth <= 0) return null;
  const widthScale = availableWidth / pageSize.width;
  const scale =
    mode === "fit-width" ? widthScale : Math.min(widthScale, boxSize.height / pageSize.height);
  return clampZoom(scale);
}

interface WorkspaceState {
  activeTool: WorkspaceTool;
  /** Sub-tool inside the Edit panel (Phase 12). */
  editSubTool: EditSubTool;
  activePage: number;
  /** Zoom factor (1 = 100%) keyed by document path. A document not present
   * here is at the settings default zoom - see `getZoom`. */
  zoomByDoc: Record<string, number>;
  /** Zoom behavior keyed by document path. Missing documents are custom. */
  zoomModeByDoc: Record<string, ZoomMode>;
  /** Facing-page view keyed by document path. Missing documents use page view. */
  bookModeByDoc: Record<string, boolean>;
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
  /** Current zoom for a document, or the settings default zoom if it was never set. */
  getZoom: (docId: string) => number;
  getZoomMode: (docId: string) => ZoomMode;
  setZoom: (docId: string, z: number) => void;
  setZoomMode: (docId: string, mode: ZoomMode) => void;
  setBookMode: (docId: string, on: boolean) => void;
  /** Stores a fit-derived scale without leaving the selected fit mode. */
  applyZoomForMode: (docId: string, z: number) => void;
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
  zoomModeByDoc: {},
  bookModeByDoc: {},
  ocrPromptOpen: false,
  autoDetectFormsRequest: 0,
  thumbnailStripCollapsed: false,
  setTool: (t) => set({ activeTool: t }),
  setEditSubTool: (t) => set({ editSubTool: t }),
  setActivePage: (n) => set({ activePage: Math.max(0, n) }),
  getZoom: (docId) => get().zoomByDoc[docId] ?? useAppStore.getState().defaultZoom,
  setZoom: (docId, z) =>
    set((s) => ({
      zoomByDoc: { ...s.zoomByDoc, [docId]: clampZoom(z) },
      zoomModeByDoc: { ...s.zoomModeByDoc, [docId]: "custom" },
    })),
  getZoomMode: (docId) => get().zoomModeByDoc[docId] ?? "custom",
  setZoomMode: (docId, mode) =>
    set((s) => ({ zoomModeByDoc: { ...s.zoomModeByDoc, [docId]: mode } })),
  setBookMode: (docId, on) =>
    set((s) => {
      const turningOn = on && !(s.bookModeByDoc[docId] ?? false);
      return {
        bookModeByDoc: { ...s.bookModeByDoc, [docId]: on },
        activePage:
          turningOn && s.activePage > 0 && s.activePage % 2 === 0
            ? s.activePage - 1
            : s.activePage,
      };
    }),
  applyZoomForMode: (docId, z) =>
    set((s) => {
      if ((s.zoomModeByDoc[docId] ?? "custom") === "custom") return s;
      return { zoomByDoc: { ...s.zoomByDoc, [docId]: clampZoom(z) } };
    }),
  zoomIn: (docId) => get().setZoom(docId, get().getZoom(docId) + ZOOM_STEP),
  zoomOut: (docId) => get().setZoom(docId, get().getZoom(docId) - ZOOM_STEP),
  resetZoom: (docId) => get().setZoom(docId, ZOOM_DEFAULT),
  openOcrPrompt: () => set({ ocrPromptOpen: true }),
  closeOcrPrompt: () => set({ ocrPromptOpen: false }),
  requestAutoDetectForms: () => set((s) => ({ autoDetectFormsRequest: s.autoDetectFormsRequest + 1 })),
  setThumbnailStripCollapsed: (collapsed) => set({ thumbnailStripCollapsed: collapsed }),
}));
