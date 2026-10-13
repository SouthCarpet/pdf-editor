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
import { commands, type Annotation, type AnnotationRef } from "@/bindings";
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
import { keepFilledMarks } from "@/components/workspace/filledFieldsState";
import { historyStore } from "@/stores/historyStore";
import { usePrefillStore } from "@/stores/prefillStore";
import { saveFormDraft } from "@/lib/formDraftSave";
import { hasUnsavedWork } from "@/lib/unsavedWork";
import { hasDirtyFormDraft } from "@/stores/formDraftStore";

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

/** The wire form of a pending annotation: without the client-only keys. */
function toWireAnnotation(annotation: ClientAnnotation): Annotation {
  const { __clientId: _id, __replaces: _replaces, ...wire } = annotation;
  void _id;
  void _replaces;
  return wire as Annotation;
}

/** Plan 119 p1: the file that holds every value saved so far. Each save
 * and each print copy starts from it, so a second save keeps the values
 * of the first one instead of starting from the original again. */
export function latestSavedSource(docId: DocId): string {
  return useDocuments.getState().documents.get(docId)?.savedPath ?? docId;
}

/** The object of each written annotation (in `pending` order), or null
 * when the write failed. */
async function applyAnnotationsCopy(
  docId: DocId,
  output: string,
  pending: readonly ClientAnnotation[],
): Promise<(AnnotationRef | null)[] | null> {
  const result = await commands.applyAnnotationsCmd({
    input: latestSavedSource(docId),
    output,
    annotations: pending.map(toWireAnnotation),
    replaced: pending.flatMap((annotation) =>
      annotation.__replaces === undefined ? [] : [annotation.__replaces],
    ),
    job_id: crypto.randomUUID(),
  });
  return result.status === "ok" ? result.data : null;
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
  return (await applyAnnotationsCopy(docId, output, pending)) !== null;
}

export async function saveDocument(
  docId: DocId,
  options: SaveDocumentOptions = {},
): Promise<SaveOutcome> {
  const pending = useAnnotations.getState().byDoc[docId] ?? NO_ANNOTATIONS;
  const formValuesTyped = hasDirtyFormDraft(docId);
  if (pending.length === 0 && !formValuesTyped) {
    return hasUnsavedWork(docId) ? "nothing-to-save" : "saved";
  }

  const output = await chooseOutputPath(docId, options);
  if (output === null) return "cancelled";

  // Plan 119 p1c: typed AcroForm values go first. The annotations then start
  // from the copy that holds them (`latestSavedSource`).
  if (formValuesTyped) {
    const saved = await saveFormDraft(docId, latestSavedSource(docId), output);
    if (!saved.ok) return "failed";
  }
  if (pending.length > 0 && !(await savePendingAnnotations(docId, output, pending))) {
    return "failed";
  }

  // Plan 062 T4.3: a successful Uložiť / Uložiť ako makes the autosave
  // record stale. Drop it even if the IPC call fails; the PDF is written.
  void Promise.resolve(commands.autosaveDelete(docId)).catch(() => {});
  // Plan 061 T1 fix wave (F2): this save flushes only the pending
  // annotations and typed form values it just wrote. The `dirty` flag
  // belongs to an in-progress Edit Text draft (`EditTextPanel` sets and
  // clears it) - a save here must not hide that unrelated unsaved work.
  return "saved";
}

/** The file to write: the path of an earlier save, or one the user picks.
 * Null when the user closes the dialog without picking. */
async function chooseOutputPath(
  docId: DocId,
  options: SaveDocumentOptions,
): Promise<string | null> {
  const existingPath = useDocuments.getState().documents.get(docId)?.savedPath ?? null;
  if (!options.forcePrompt && existingPath) return existingPath;
  const sourcePath = existingPath ?? docId;
  const dir = saveDialogDefaultDir(sourcePath, useAppStore.getState().defaultSaveFolder);
  return pickSavePath({
    defaultPath: joinDir(dir, suggestedSaveFileName(docId, existingPath)),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
}

async function savePendingAnnotations(
  docId: DocId,
  output: string,
  pending: readonly ClientAnnotation[],
): Promise<boolean> {
  const written = await applyAnnotationsCopy(docId, output, pending);
  if (written === null) return false;

  // Plan 062 T6.2: a successful save is the moment this fill becomes "the last fill".
  usePrefillStore.getState().recordFill(docId, pending);

  useDocuments.getState().setSavedPath(docId, output);
  keepUnwrittenWork(docId, pending, written);
  return true;
}

/**
 * Plan 119 p1 and p1b: the save wrote `pending` as it was when the write
 * started. A value added during the write is not in the file, and neither
 * is an edit made during the write. Both stay pending; the edited one now
 * replaces the version the save just wrote. Everything else is cleared.
 */
function keepUnwrittenWork(
  docId: DocId,
  pending: readonly ClientAnnotation[],
  written: readonly (AnnotationRef | null)[],
): void {
  const current = useAnnotations.getState().byDoc[docId] ?? NO_ANNOTATIONS;
  const left = unwrittenWork(current, pending, written);
  const leftIds = new Set(left.map((annotation) => annotation.__clientId));
  useAnnotations.getState().clear(docId);
  historyStore.getState().clear(docId);
  clearAnnotationFieldLinks(docId);
  if (left.length === 0) {
    useFilledFields.getState().clear(docId);
    return;
  }
  useFilledFields.getState().setFilled(docId, (marks) => keepFilledMarks(marks, leftIds));
  useAnnotations.setState((state) => ({ byDoc: { ...state.byDoc, [docId]: left } }));
}

function unwrittenWork(
  current: readonly ClientAnnotation[],
  pending: readonly ClientAnnotation[],
  written: readonly (AnnotationRef | null)[],
): ClientAnnotation[] {
  const writtenIndex = new Map(pending.map((annotation, index) => [annotation.__clientId, index]));
  return current.flatMap((annotation) => {
    const index = writtenIndex.get(annotation.__clientId);
    if (index === undefined) return [annotation];
    if (annotation === pending[index]) return [];
    const ref = written[index];
    if (ref === null || ref === undefined) return [withoutReplaces(annotation)];
    return [{ ...annotation, __replaces: ref }];
  });
}

/** Plan 119 p1c: the save removed the object `__replaces` names, and wrote
 * nothing in its place (an emptied value). The object number can be given
 * to a later annotation, so the edit must not name it again. */
function withoutReplaces(annotation: ClientAnnotation): ClientAnnotation {
  const { __replaces: _replaces, ...rest } = annotation;
  void _replaces;
  return rest as ClientAnnotation;
}
