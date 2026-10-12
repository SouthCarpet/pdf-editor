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
import { useAppStore } from "@/stores/appStore";
import { clearAnnotationFieldLinks } from "@/stores/annotationHistory";
import {
  NO_ANNOTATIONS,
  useAnnotations,
  type ClientAnnotation,
} from "@/stores/annotationsStore";
import { useDocuments, type DocId } from "@/stores/documentStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { historyStore } from "@/stores/historyStore";
import { usePrefillStore } from "@/stores/prefillStore";
import { hasUnsavedWork } from "@/lib/unsavedWork";

/** Directory the save dialog should open in: the user's default folder when
 * set, otherwise the document's parent folder (today's behaviour). */
export function saveDialogDefaultDir(
  docPath: string,
  defaultSaveFolder: string | null,
): string {
  if (defaultSaveFolder) return defaultSaveFolder;
  const slash = Math.max(docPath.lastIndexOf("/"), docPath.lastIndexOf("\\"));
  if (slash <= 0) return "";
  return docPath.slice(0, slash);
}

function joinDir(dir: string, file: string): string {
  if (!dir) return file;
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${file}` : `${dir}${sep}${file}`;
}

function suggestedSaveFileName(docPath: string, existingPath: string | null): string {
  const source = existingPath ?? docPath.replace(/\.pdf$/i, ".annotated.pdf");
  return source.split(/[\\/]/).pop() ?? source;
}

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

/** Plan 119 p1: the file that holds every value saved so far. Each save
 * and each print copy starts from it, so a second save keeps the values
 * of the first one instead of starting from the original again. */
export function latestSavedSource(docId: DocId): string {
  return useDocuments.getState().documents.get(docId)?.savedPath ?? docId;
}

async function applyAnnotationsCopy(
  docId: DocId,
  output: string,
  pending: readonly ClientAnnotation[],
): Promise<boolean> {
  const result = await commands.applyAnnotationsCmd({
    input: latestSavedSource(docId),
    output,
    annotations: pending.map(stripClientId) as Annotation[],
    job_id: crypto.randomUUID(),
  });
  return result.status === "ok";
}

/**
 * Writes a flattened copy for printing through the same Rust apply path as
 * Save, without changing the open document, its save path, or pending state.
 * An empty pending list still writes a temporary copy of the source PDF.
 */
export async function writePendingAnnotationsCopy(
  docId: DocId,
  output: string,
): Promise<boolean> {
  const pending = useAnnotations.getState().byDoc[docId] ?? NO_ANNOTATIONS;
  return applyAnnotationsCopy(docId, output, pending);
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
    const sourcePath = existingPath ?? docId;
    const dir = saveDialogDefaultDir(sourcePath, useAppStore.getState().defaultSaveFolder);
    const picked = await pickSavePath({
      defaultPath: joinDir(dir, suggestedSaveFileName(docId, existingPath)),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!picked) return "cancelled";
    output = picked;
  }

  if (!(await applyAnnotationsCopy(docId, output, pending))) return "failed";

  // Plan 062 T6.2: a successful save is the moment this fill becomes "the last fill".
  usePrefillStore.getState().recordFill(docId, pending);

  useDocuments.getState().setSavedPath(docId, output);
  // Plan 119 p1: a value added while the file was being written is not in
  // it yet. Keep it pending instead of clearing it with the saved ones.
  const savedIds = new Set(pending.map((annotation) => annotation.__clientId));
  const addedDuringSave = (useAnnotations.getState().byDoc[docId] ?? NO_ANNOTATIONS).filter(
    (annotation) => !savedIds.has(annotation.__clientId),
  );
  useAnnotations.getState().clear(docId);
  historyStore.getState().clear(docId);
  clearAnnotationFieldLinks(docId);
  useFilledFields.getState().clear(docId);
  if (addedDuringSave.length > 0) {
    useAnnotations.setState((state) => ({
      byDoc: { ...state.byDoc, [docId]: addedDuringSave },
    }));
  }
  // Plan 062 T4.3: a successful Uložiť / Uložiť ako makes the autosave
  // record stale. Drop it even if the IPC call fails; the PDF is written.
  void Promise.resolve(commands.autosaveDelete(docId)).catch(() => {});
  // Plan 061 T1 fix wave (F2): this save flushes only the pending
  // annotations it just wrote. The `dirty` flag belongs to an in-progress
  // Edit Text draft (`EditTextPanel` sets and clears it) - a save here must
  // not hide that unrelated unsaved work.
  return "saved";
}
