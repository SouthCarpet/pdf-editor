// Plan 060 task T1 (R1/R2): wires `resolveShortcut` to real keydown events,
// once per mounted workspace (not once per panel), and dispatches into the
// zoom store / shared save and field-navigation flows. Resolution lives in
// `shortcuts.ts` so it can be unit-tested without touching the DOM.
import { useEffect } from "react";
import { useWorkspace } from "@/stores/workspaceStore";
import { hasUnsavedWork } from "@/lib/unsavedWork";
import { saveDocument } from "@/lib/documentSave";
import { resolveShortcut, shortcutFocus, type ShortcutAction } from "./shortcuts";

function runAction(
  action: ShortcutAction,
  docId: string,
  zoom: ZoomActions,
  handlers: WorkspaceShortcutHandlers,
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
      handlers.onDeletePending?.();
      return;
    case "next-field":
      handlers.onNextField?.();
      return;
    case "previous-field":
      handlers.onPreviousField?.();
      return;
    case "confirm-next-field":
      handlers.onConfirmNextField?.();
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
  onNextField?: () => void;
  onPreviousField?: () => void;
  onConfirmNextField?: () => void;
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
  const { onDeletePending, onNextField, onPreviousField, onConfirmNextField } = handlers;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = resolveShortcut(e, shortcutFocus(e.target));
      if (!action) return;
      e.preventDefault();
      runAction(action, docId, { zoomIn, zoomOut, resetZoom }, {
        onDeletePending,
        onNextField,
        onPreviousField,
        onConfirmNextField,
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    docId,
    zoomIn,
    zoomOut,
    resetZoom,
    onDeletePending,
    onNextField,
    onPreviousField,
    onConfirmNextField,
  ]);
}
