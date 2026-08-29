// Plan 060 task T1 (R1/R2): wires `resolveShortcut` to real keydown events,
// once per mounted workspace (not once per panel), and dispatches into the
// zoom store / shared save flow. The resolution logic itself lives in
// `shortcuts.ts` so it can be unit-tested without touching the DOM.
import { useEffect } from "react";
import { useWorkspace } from "@/stores/workspaceStore";
import { hasUnsavedWork } from "@/lib/unsavedWork";
import { saveDocument } from "@/lib/documentSave";
import { isTextInputTarget, resolveShortcut, type ShortcutAction } from "./shortcuts";

function runAction(
  action: ShortcutAction,
  docId: string,
  zoom: ZoomActions,
  onDeletePending: (() => void) | undefined,
): void {
  switch (action.type) {
    case "zoom-in":
      zoom.zoomIn(docId);
      return;
    case "zoom-out":
      zoom.zoomOut(docId);
      return;
    case "zoom-reset":
      zoom.resetZoom(docId);
      return;
    case "save":
      if (hasUnsavedWork(docId)) void saveDocument(docId);
      return;
    case "save-as":
      if (hasUnsavedWork(docId)) void saveDocument(docId, { forcePrompt: true });
      return;
    case "delete-pending":
      onDeletePending?.();
  }
}

interface ZoomActions {
  zoomIn: (docId: string) => void;
  zoomOut: (docId: string) => void;
  resetZoom: (docId: string) => void;
}

interface WorkspaceShortcutHandlers {
  /** Plan 062 T1.1: Delete / Backspace on a selected pending fill. */
  onDeletePending?: () => void;
}

/** Registers the workspace keyboard shortcuts for the given document.
 * Call once at the workspace level - see `Workspace.tsx`. */
export function useWorkspaceShortcuts(
  docId: string,
  handlers: WorkspaceShortcutHandlers = {},
): void {
  const zoomIn = useWorkspace((s) => s.zoomIn);
  const zoomOut = useWorkspace((s) => s.zoomOut);
  const resetZoom = useWorkspace((s) => s.resetZoom);
  const onDeletePending = handlers.onDeletePending;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = resolveShortcut(e, isTextInputTarget(e.target));
      if (!action) return;
      e.preventDefault();
      runAction(action, docId, { zoomIn, zoomOut, resetZoom }, onDeletePending);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [docId, zoomIn, zoomOut, resetZoom, onDeletePending]);
}
