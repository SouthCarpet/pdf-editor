// Plan 062 T4.3: autosave of pending fills (annotations + filled marks).
//
// Pure decisions live here so they can be tested without mounting the
// workspace. The thin effect (`useDocumentAutosave`) rate-limits
// `autosavePut` while a document has pending fills, and flushes immediately
// on window blur / `visibilitychange` hidden. Recovery (offer, never
// auto-apply) lives in `DocumentAutosave.tsx`.
import { useEffect, useRef } from "react";
import { commands } from "@/bindings";
import { NO_ANNOTATIONS, useAnnotations, type ClientAnnotation } from "@/stores/annotationsStore";
import { clearAnnotationFieldLinks, linkAnnotationToFilledField } from "@/stores/annotationHistory";
import { useAppStore } from "@/stores/appStore";
import { useDocuments } from "@/stores/documentStore";
import {
  NO_FORM_DRAFT,
  dirtyFormDraft,
  hasDirtyFormDraft,
  useFormDrafts,
  type DirtyFormDraft,
} from "@/stores/formDraftStore";
import { filledMarksFor, useFilledFields } from "@/stores/filledFieldsStore";
import { historyStore } from "@/stores/historyStore";
import {
  EMPTY_FILLED_FIELDS,
  markFieldFilled,
  unmarkFieldForClientId,
  type FilledFieldsState,
} from "./filledFieldsState";

export const AUTOSAVE_VERSION = 1;
export const DEFAULT_AUTOSAVE_INTERVAL_SEC = 10;

export interface SerializedFilledMarks {
  key: string;
  ids: string[];
  fieldIdByClientId: Record<string, string>;
}

export interface AutosaveRecord {
  v: typeof AUTOSAVE_VERSION;
  savedAt: number;
  annotations: ClientAnnotation[];
  filledMarks: SerializedFilledMarks;
  /** Plan 119 p1c: AcroForm values typed and not yet saved. Absent in a
   * record written before this field existed, and when nothing is typed. */
  formDraft?: DirtyFormDraft;
}

/** Write when dirty and either forced (blur) or the interval has elapsed
 * since `lastSavedAt`. A null `lastSavedAt` is treated as elapsed (first
 * write). Nothing is written while not dirty, including on blur. */
export function autosaveScheduler(
  now: number,
  lastSavedAt: number | null,
  dirty: boolean,
  intervalMs: number,
  force = false,
): boolean {
  if (!dirty) return false;
  if (force) return true;
  if (lastSavedAt === null) return true;
  return now - lastSavedAt >= intervalMs;
}

/**
 * Offer recovery when a v1 record exists and is newer than the file.
 * When `fileMtime` is null the mtime could not be read (no permission,
 * `stat` failed, or the platform left mtime empty) and any record is
 * offered. Equal timestamps are treated as stale (the file was saved at
 * or after the autosave).
 */
export function shouldOfferRecovery(
  record: AutosaveRecord | null,
  fileMtime: number | null,
): boolean {
  if (record === null) return false;
  if (fileMtime === null) return true;
  return record.savedAt > fileMtime;
}

export function serializeFilledMarks(state: FilledFieldsState): SerializedFilledMarks {
  return {
    key: state.key,
    ids: [...state.ids],
    fieldIdByClientId: { ...state.fieldIdByClientId },
  };
}

export function deserializeFilledMarks(marks: SerializedFilledMarks): FilledFieldsState {
  return {
    key: marks.key,
    ids: new Set(marks.ids),
    fieldIdByClientId: { ...marks.fieldIdByClientId },
  };
}

export function serializePendingState(
  annotations: ClientAnnotation[],
  filledMarks: SerializedFilledMarks,
  savedAt: number,
  formDraft?: DirtyFormDraft,
): AutosaveRecord {
  const record: AutosaveRecord = { v: AUTOSAVE_VERSION, savedAt, annotations, filledMarks };
  if (formDraft !== undefined && Object.keys(formDraft.values).length > 0) {
    record.formDraft = formDraft;
  }
  return record;
}

export function parseAutosaveRecord(json: string): AutosaveRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.v !== AUTOSAVE_VERSION) return null;
  if (typeof obj.savedAt !== "number" || !Number.isFinite(obj.savedAt)) return null;
  if (!Array.isArray(obj.annotations)) return null;
  if (!obj.annotations.every(isClientAnnotation)) return null;
  const marks = parseFilledMarks(obj.filledMarks);
  if (marks === null) return null;
  const formDraft = obj.formDraft === undefined ? undefined : parseFormDraft(obj.formDraft);
  if (formDraft === null) return null;
  return serializePendingState(obj.annotations, marks, obj.savedAt, formDraft);
}

/** Null when the stored draft is malformed: the whole record is then
 * refused, like a malformed annotation. */
function parseFormDraft(value: unknown): DirtyFormDraft | null {
  if (!isPlainObject(value) || !isPlainObject(value.values) || !isPlainObject(value.places)) {
    return null;
  }
  const { values, places } = value;
  if (!Object.values(values).every((entry) => entry === null || typeof entry === "string")) {
    return null;
  }
  if (!Object.values(places).every(isFormPlace)) return null;
  return { values: values as DirtyFormDraft["values"], places: places as DirtyFormDraft["places"] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFormPlace(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    typeof value.kind === "string" &&
    (value.page_index === null || typeof value.page_index === "number") &&
    Array.isArray(value.rect)
  );
}

function isClientAnnotation(value: unknown): value is ClientAnnotation {
  if (typeof value !== "object" || value === null) return false;
  const row = value as { __clientId?: unknown; type?: unknown };
  return typeof row.__clientId === "string" && typeof row.type === "string";
}

function parseFilledMarks(value: unknown): SerializedFilledMarks | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.key !== "string") return null;
  if (!Array.isArray(row.ids) || !row.ids.every((id) => typeof id === "string")) return null;
  if (typeof row.fieldIdByClientId !== "object" || row.fieldIdByClientId === null) return null;
  const fieldIdByClientId: Record<string, string> = {};
  for (const [clientId, fieldId] of Object.entries(
    row.fieldIdByClientId as Record<string, unknown>,
  )) {
    if (typeof fieldId !== "string") return null;
    fieldIdByClientId[clientId] = fieldId;
  }
  return { key: row.key, ids: row.ids, fieldIdByClientId };
}

/** Rebuilds the annotation-to-filled-field links a restore would otherwise
 * lose (plan 062 final fix wave F5). `linkAnnotationToFilledField` is only
 * ever called live, while the user fills a field; a crash-recovery restore
 * skipped it, so Delete and undo on a restored fill never updated the
 * detected-field overlay. Detected-field ids carry their page
 * (`"{page_index}:{ordinal}"`), so each link can be rebuilt against the
 * exact page it belongs to, the same key format `Workspace.tsx` uses. */
function relinkFilledFields(docPath: string, fieldIdByClientId: Record<string, string>): void {
  for (const [clientId, fieldId] of Object.entries(fieldIdByClientId)) {
    const pageIndex = fieldId.slice(0, fieldId.indexOf(":"));
    const pageKey = `${docPath}\u0000${pageIndex}`;
    linkAnnotationToFilledField(docPath, clientId, {
      mark: () =>
        useFilledFields
          .getState()
          .setFilled(docPath, (current) => markFieldFilled(current, pageKey, fieldId, clientId)),
      unmark: () =>
        useFilledFields
          .getState()
          .setFilled(docPath, (current) => unmarkFieldForClientId(current, pageKey, clientId)),
    });
  }
}

/** Undo history starts empty after a restore: the snapshot is the new
 * baseline, so Ctrl+Z must not walk back into the pre-crash session. */
export function restoreAutosaveRecord(docPath: string, record: AutosaveRecord): void {
  useAnnotations.setState((state) => ({
    byDoc: { ...state.byDoc, [docPath]: record.annotations },
  }));
  useFilledFields.getState().restore(docPath, deserializeFilledMarks(record.filledMarks));
  historyStore.getState().clear(docPath);
  clearAnnotationFieldLinks(docPath);
  relinkFilledFields(docPath, record.filledMarks.fieldIdByClientId);
  if (record.formDraft !== undefined) useFormDrafts.getState().restore(docPath, record.formDraft);
  // The typed form values count as unsaved work by themselves; the flag is
  // for the annotation side of the record.
  if (record.annotations.length > 0) useDocuments.getState().markDirty(docPath, true);
}

export function hasPendingFills(docPath: string): boolean {
  const annotations = useAnnotations.getState().byDoc[docPath] ?? NO_ANNOTATIONS;
  if (annotations.length > 0) return true;
  if (hasDirtyFormDraft(docPath)) return true;
  return filledMarksFor(docPath).ids.size > 0;
}

function intervalMsFromStore(): number {
  const sec = useAppStore.getState().autosaveIntervalSec;
  const safe =
    typeof sec === "number" && Number.isFinite(sec) && sec > 0
      ? sec
      : DEFAULT_AUTOSAVE_INTERVAL_SEC;
  return safe * 1000;
}

async function putPending(docPath: string, now: number): Promise<boolean> {
  const payload = serializePendingState(
    useAnnotations.getState().byDoc[docPath] ?? NO_ANNOTATIONS,
    serializeFilledMarks(useFilledFields.getState().byDoc[docPath] ?? EMPTY_FILLED_FIELDS),
    now,
    dirtyFormDraft(useFormDrafts.getState().byDoc[docPath] ?? NO_FORM_DRAFT),
  );
  const result = await commands.autosavePut(docPath, JSON.stringify(payload));
  return result.status === "ok";
}

/** Thin effect: at most every `autosaveIntervalSec` (default 10) while
 * dirty, and immediately on blur / hidden. Writes nothing when clean. */
export function useDocumentAutosave(docPath: string): void {
  const lastSavedAtRef = useRef<number | null>(null);

  useEffect(() => {
    lastSavedAtRef.current = null;
    let inFlight = false;

    async function write(force: boolean): Promise<void> {
      if (inFlight) return;
      const now = Date.now();
      const dirty = hasPendingFills(docPath);
      if (!autosaveScheduler(now, lastSavedAtRef.current, dirty, intervalMsFromStore(), force)) {
        return;
      }
      inFlight = true;
      try {
        if (await putPending(docPath, now)) lastSavedAtRef.current = now;
      } catch {
        // SQLite / IPC failure: try again on the next tick or blur.
      } finally {
        inFlight = false;
      }
    }

    const onBlur = () => {
      void write(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void write(true);
    };

    const unsubAnn = useAnnotations.subscribe(() => {
      void write(false);
    });
    const unsubFilled = useFilledFields.subscribe(() => {
      void write(false);
    });
    const unsubDrafts = useFormDrafts.subscribe(() => {
      void write(false);
    });
    const intervalId = window.setInterval(() => {
      void write(false);
    }, 1000);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    void write(false);

    return () => {
      unsubAnn();
      unsubFilled();
      unsubDrafts();
      window.clearInterval(intervalId);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [docPath]);
}
