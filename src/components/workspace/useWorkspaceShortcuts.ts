// Plan 060 task T1 (R1/R2): wires `resolveShortcut` to real keydown events,
// once per mounted workspace (not once per panel), and dispatches into the
// zoom store / shared save and field-navigation flows. Resolution lives in
// `shortcuts.ts` so it can be unit-tested without touching the DOM.
import { useEffect } from "react";
import { useWorkspace } from "@/stores/workspaceStore";
import { historyStore } from "@/stores/historyStore";
import { hasUnsavedWork } from "@/lib/unsavedWork";
import { saveDocument } from "@/lib/documentSave";
import { resolveShortcut, shortcutFocus, type ShortcutAction } from "./shortcuts";
import { requestWorkspacePrint } from "./printRequest";

function runAction(
  action: ShortcutAction,
  docId: string,
  zoom: ZoomActions,
  handlers: WorkspaceShortcutHandlers,
): boolean {
  switch (action.type) {
    case "zoom-in":
      zoom.zoomIn(docId);
      return true;
    case "zoom-out":
      zoom.zoomOut(docId);
      return true;
    case "zoom-reset":
      zoom.resetZoom(docId);
      return true;
    case "toggle-book-mode":
      handlers.onToggleBookMode?.();
      return handlers.onToggleBookMode !== undefined;
    case "save":
      if (hasUnsavedWork(docId)) void saveDocument(docId);
      return true;
    case "save-as":
      if (hasUnsavedWork(docId)) void saveDocument(docId, { forcePrompt: true });
      return true;
    case "print":
      requestWorkspacePrint(docId);
      return true;
    case "undo":
      historyStore.getState().undo(docId);
      return true;
    case "redo":
      historyStore.getState().redo(docId);
      return true;
    case "delete-pending":
      handlers.onDeletePending?.();
      return true;
    case "next-field":
      handlers.onNextField?.();
      return true;
    case "previous-field":
      handlers.onPreviousField?.();
      return true;
    case "confirm-next-field":
      handlers.onConfirmNextField?.();
      return true;
    case "previous-page":
      handlers.onPreviousPage?.();
      return handlers.onPreviousPage !== undefined;
    case "next-page":
      handlers.onNextPage?.();
      return handlers.onNextPage !== undefined;
    case "previous-spread":
      handlers.onPreviousSpread?.();
      return handlers.onPreviousSpread !== undefined;
    case "next-spread":
      handlers.onNextSpread?.();
      return handlers.onNextSpread !== undefined;
    case "first-page":
      handlers.onFirstPage?.();
      return handlers.onFirstPage !== undefined;
    case "last-page":
      handlers.onLastPage?.();
      return handlers.onLastPage !== undefined;
    case "open-search":
      handlers.onOpenSearch?.();
      return handlers.onOpenSearch !== undefined;
    case "open-shortcuts":
      handlers.onOpenShortcuts?.();
      return handlers.onOpenShortcuts !== undefined;
    case "next-search-match":
      if (!handlers.searchOpen) return false;
      handlers.onNextSearchMatch?.();
      return handlers.onNextSearchMatch !== undefined;
    case "previous-search-match":
      if (!handlers.searchOpen) return false;
      handlers.onPreviousSearchMatch?.();
      return handlers.onPreviousSearchMatch !== undefined;
    case "close-search":
      return false;
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
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onPreviousSpread?: () => void;
  onNextSpread?: () => void;
  onToggleBookMode?: () => void;
  onFirstPage?: () => void;
  onLastPage?: () => void;
  onOpenSearch?: () => void;
  onOpenShortcuts?: () => void;
  searchOpen?: boolean;
  onCloseSearch?: () => void;
  onNextSearchMatch?: () => void;
  onPreviousSearchMatch?: () => void;
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
  const {
    onDeletePending,
    onNextField,
    onPreviousField,
    onConfirmNextField,
    onPreviousPage,
    onNextPage,
    onPreviousSpread,
    onNextSpread,
    onToggleBookMode,
    onFirstPage,
    onLastPage,
    onOpenSearch,
    onOpenShortcuts,
    searchOpen = false,
    onCloseSearch,
    onNextSearchMatch,
    onPreviousSearchMatch,
  } = handlers;

  useEffect(() => {
    // Capture gives an open search box first refusal on Escape. Stopping
    // propagation here leaves the pending-annotation strip mounted; when
    // search is closed, the event proceeds to the strip's document listener.
    function onCaptureKeyDown(e: KeyboardEvent) {
      const action = resolveShortcut(e, shortcutFocus(e.target));
      if (action?.type !== "close-search" || !searchOpen || !onCloseSearch) return;
      e.preventDefault();
      e.stopPropagation();
      onCloseSearch();
    }

    function onKeyDown(e: KeyboardEvent) {
      const action = resolveShortcut(e, shortcutFocus(e.target));
      if (!action) return;
      const handled = runAction(action, docId, { zoomIn, zoomOut, resetZoom }, {
        onDeletePending,
        onNextField,
        onPreviousField,
        onConfirmNextField,
        onPreviousPage,
        onNextPage,
        onPreviousSpread,
        onNextSpread,
        onToggleBookMode,
        onFirstPage,
        onLastPage,
        onOpenSearch,
        onOpenShortcuts,
        searchOpen,
        onCloseSearch,
        onNextSearchMatch,
        onPreviousSearchMatch,
      });
      if (handled) e.preventDefault();
    }
    window.addEventListener("keydown", onCaptureKeyDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onCaptureKeyDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    docId,
    zoomIn,
    zoomOut,
    resetZoom,
    onDeletePending,
    onNextField,
    onPreviousField,
    onConfirmNextField,
    onPreviousPage,
    onNextPage,
    onPreviousSpread,
    onNextSpread,
    onToggleBookMode,
    onFirstPage,
    onLastPage,
    onOpenSearch,
    onOpenShortcuts,
    searchOpen,
    onCloseSearch,
    onNextSearchMatch,
    onPreviousSearchMatch,
  ]);
}
