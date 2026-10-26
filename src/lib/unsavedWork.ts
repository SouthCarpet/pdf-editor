// Plan 050 task D2-UX-2 (R1): one place that answers "does this document
// have work that would be lost silently right now?".
//
// Three sources feed it today:
//   - pending (unsaved) annotations from the Forms or Annotations sub-tool,
//     tracked in `annotationsStore` (D2-UX; never persisted until the user
//     runs the existing save flow, `pickSavePath` + `apply_annotations_cmd`).
//   - any other unsaved edit the stores already track, via
//     `documentStore`'s per-document `dirty` flag. `EditTextPanel` wires an
//     in-progress (not yet Applied) text-run edit into it - the "unsaved
//     OCR text edit" case named in the task brief, since Edit > Text is
//     where a document's recognised text gets rewritten.
//   - native AcroForm values typed in the Forms panel and not yet written
//     (plan 119 p1c), tracked in `formDraftStore`.
//
// Kept as plain functions reading store snapshots (not only hooks) because
// the window-close listener and the tab-close guard both need the answer
// from an event handler, outside any render.
import { NO_ANNOTATIONS, useAnnotations } from "@/stores/annotationsStore";
import { useDocuments, type DocId } from "@/stores/documentStore";
import { hasDirtyFormDraft, useHasDirtyFormDraft } from "@/stores/formDraftStore";

function hasPendingAnnotations(docId: DocId): boolean {
  return (useAnnotations.getState().byDoc[docId] ?? NO_ANNOTATIONS).length > 0;
}

function hasOtherTrackedEdit(docId: DocId): boolean {
  return useDocuments.getState().documents.get(docId)?.dirty === true;
}

/** Imperative check for use outside React (event handlers, the window
 * close listener). */
export function hasUnsavedWork(docId: DocId): boolean {
  return hasPendingAnnotations(docId) || hasOtherTrackedEdit(docId) || hasDirtyFormDraft(docId);
}

/** Reactive version for components that must re-render when the answer
 * changes (the tab's unsaved-changes dot). */
export function useHasUnsavedWork(docId: DocId): boolean {
  const pending = useAnnotations((s) => (s.byDoc[docId] ?? NO_ANNOTATIONS).length > 0);
  const other = useDocuments((s) => s.documents.get(docId)?.dirty === true);
  const formValues = useHasDirtyFormDraft(docId);
  return pending || other || formValues;
}

/** Every open document id that currently has unsaved work, in the order
 * `documentStore` holds them. Used to decide whether the window close
 * guard needs to appear, and which documents it should list. */
export function unsavedDocIds(): DocId[] {
  const { documents } = useDocuments.getState();
  return Array.from(documents.keys()).filter((id) => hasUnsavedWork(id));
}
