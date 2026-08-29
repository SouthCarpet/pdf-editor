// Plan 060 task T1 (R2): the one save flow for a document's pending
// work (form fills and free-text annotations, both tracked as
// `ClientAnnotation`s in `annotationsStore`, keyed by document path).
//
// Before this task the same few lines existed twice - once in
// `CloseGuardDialog` (window/tab close) and once in `DetectFieldsSection`
// (the Forms panel's "Save filled copy") - and neither remembered a path
// it had already asked for, so every save re-opened the file dialog. This
// module is the single place both call, plus the new global toolbar
// Save / Save as.
import { commands, type Annotation } from "@/bindings";
import { pickSavePath } from "@/tauri/bridge";
import { NO_ANNOTATIONS, useAnnotations } from "@/stores/annotationsStore";
import { useDocuments, type DocId } from "@/stores/documentStore";
import { hasUnsavedWork } from "@/lib/unsavedWork";

/**
 * - "saved": the write succeeded (or there was nothing pending to write).
 * - "nothing-to-save": the document is dirty, but its only unsaved work is
 *   something no command can flush (e.g. an in-progress text-run edit -
 *   Edit > Text has to be Applied first).
 * - "cancelled": the user closed the save-path dialog without picking one.
 * - "failed": the save-path dialog resolved, but the write itself errored.
 */
export type SaveOutcome = "saved" | "nothing-to-save" | "cancelled" | "failed";

export interface SaveDocumentOptions {
  /** "Uložiť ako": always ask for a path, even if this document already
   * has one from an earlier save. */
  forcePrompt?: boolean;
}

function stripClientId<T extends { __clientId: string }>(a: T): Omit<T, "__clientId"> {
  const { __clientId: _drop, ...rest } = a;
  void _drop;
  return rest;
}

export async function saveDocument(
  docId: DocId,
  options: SaveDocumentOptions = {},
): Promise<SaveOutcome> {
  const pending = useAnnotations.getState().byDoc[docId] ?? NO_ANNOTATIONS;
  if (pending.length === 0) {
    return hasUnsavedWork(docId) ? "nothing-to-save" : "saved";
  }

  const existingPath = useDocuments.getState().documents.get(docId)?.savedPath ?? null;
  let output = existingPath;
  if (options.forcePrompt || !output) {
    const picked = await pickSavePath({
      defaultPath: existingPath ?? docId.replace(/\.pdf$/i, ".annotated.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!picked) return "cancelled";
    output = picked;
  }

  const result = await commands.applyAnnotationsCmd({
    input: docId,
    output,
    annotations: pending.map(stripClientId) as Annotation[],
    job_id: crypto.randomUUID(),
  });
  if (result.status !== "ok") return "failed";

  useDocuments.getState().setSavedPath(docId, output);
  useAnnotations.getState().clear(docId);
  // Plan 061 T1 fix wave (F2): this save flushes only the pending
  // annotations it just wrote. The `dirty` flag belongs to an in-progress
  // Edit Text draft (`EditTextPanel` sets and clears it) - a save here must
  // not hide that unrelated unsaved work.
  return "saved";
}
