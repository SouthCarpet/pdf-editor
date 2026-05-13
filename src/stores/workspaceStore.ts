// Workspace-level transient state: which tool tab is active, which page
// the user is on, and the current zoom factor. Persistence belongs to the
// document store; this one is wiped on app reload.
import { create } from "zustand";

export type WorkspaceTool = "edit" | "organize" | "crop" | "extract" | "compare";

interface WorkspaceState {
  activeTool: WorkspaceTool;
  activePage: number;
  zoom: number;
  setTool: (t: WorkspaceTool) => void;
  setActivePage: (n: number) => void;
  setZoom: (z: number) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  activeTool: "edit",
  activePage: 0,
  zoom: 1.0,
  setTool: (t) => set({ activeTool: t }),
  setActivePage: (n) => set({ activePage: Math.max(0, n) }),
  // Clamp zoom to a sane range so accidental wheel events can't blow the
  // canvas up to OOM territory.
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(z, 4)) }),
}));
