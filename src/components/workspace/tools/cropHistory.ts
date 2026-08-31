import { historyStore } from "@/stores/historyStore";
import { cropRectsEqual, type CropRect } from "./cropModel";

/** History entry label for crop-rectangle edits (plan 062 T5.2, relabelled
 * in the final fix wave F2). `WorkspaceTopBar.historyEntryText` maps
 * `"crop"` to the localized `workspace:history.entries.crop` string; a raw
 * Slovak literal here showed up untranslated in the English UI. Apply
 * clears this stack (T2.2: undo is for crop before Apply). */
export const CROP_HISTORY_LABEL = "crop";

export function commitCropRectChange(
  docPath: string,
  before: CropRect,
  after: CropRect,
  apply: (rect: CropRect) => void,
): void {
  if (cropRectsEqual(before, after)) return;
  apply(after);
  historyStore.getState().push(docPath, {
    label: CROP_HISTORY_LABEL,
    undo: () => apply(before),
    redo: () => apply(after),
  });
}

/** Drag records one history entry on pointer-up, not per move. */
export function commitCropDragEnd(
  docPath: string,
  start: CropRect,
  end: CropRect,
  apply: (rect: CropRect) => void,
): void {
  commitCropRectChange(docPath, start, end, apply);
}
