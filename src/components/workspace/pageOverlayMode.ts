// Plan 119 p1: which Konva overlay the focused page shows.
//
// "edit" mounts the interactive `EditPageOverlay` (pick a detected field,
// select, drag or resize a pending annotation, place a stamp). "preview"
// mounts the same pending annotations read-only, so a filled value stays
// on the page in every other tool and sub-tool until it is saved into the
// PDF. Without the preview, switching from Forms to Text hid every value
// the user had typed (owner report 2026-10-11, debug note 052).
import type { EditSubTool, WorkspaceTool } from "@/stores/workspaceStore";

export type PageOverlayMode = "edit" | "preview" | "none";

export interface PageOverlayInput {
  activeTool: WorkspaceTool;
  editSubTool: EditSubTool;
  hasDetectedFields: boolean;
  hasPendingOnPage: boolean;
  placingStamp: boolean;
}

export function pageOverlayMode({
  activeTool,
  editSubTool,
  hasDetectedFields,
  hasPendingOnPage,
  placingStamp,
}: PageOverlayInput): PageOverlayMode {
  const editsPending = editsPendingValues(activeTool, editSubTool);
  const showsDetected = editSubTool === "forms" || editSubTool === "signature";
  if (editsPending && ((showsDetected && hasDetectedFields) || hasPendingOnPage || placingStamp)) {
    return "edit";
  }
  return hasPendingOnPage ? "preview" : "none";
}

function editsPendingValues(activeTool: WorkspaceTool, editSubTool: EditSubTool): boolean {
  return activeTool === "edit" &&
    (editSubTool === "forms" || editSubTool === "annotations" || editSubTool === "signature");
}
