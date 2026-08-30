import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DetectedFormField } from "@/bindings";
import type { ClientAnnotation } from "./annotationsStore";
import {
  fieldPositionKey,
  roundedRectKey,
  templateKey,
  type PageSize,
} from "@/components/workspace/prefill/templateHash";

export const PREFILL_STORE_KEY = "pdf-editor-prefill";
export const PREFILL_TEMPLATE_CAP = 50;

export interface PrefillRecord {
  templateKey: string;
  savedAt: number;
  values: Record<string, string>;
}

interface RememberedLayout {
  pageSize: PageSize;
  fields: DetectedFormField[];
}

interface PrefillState {
  records: PrefillRecord[];
  layoutsByDoc: Record<string, RememberedLayout>;
  dismissedDocIds: string[];
  rememberLayout: (docPath: string, pageSize: PageSize, fields: DetectedFormField[]) => void;
  recordFill: (docPath: string, pending: readonly ClientAnnotation[], now?: number) => void;
  recordForTemplate: (key: string) => PrefillRecord | undefined;
  dismissOffer: (docPath: string) => void;
  isDismissed: (docPath: string) => boolean;
}

function valuesFromLatestFill(
  fields: readonly DetectedFormField[],
  pending: readonly ClientAnnotation[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const annotation = pending.find(
      (item) =>
        item.type === "free_text" &&
        item.page === field.page_index &&
        roundedRectKey(item.rect) === roundedRectKey(field.rect),
    );
    if (annotation === undefined || annotation.type !== "free_text") continue;
    const text = annotation.contents.trim();
    if (text.length === 0) continue;
    values[fieldPositionKey(field)] = text;
  }
  return values;
}

function upsertRecord(
  records: PrefillRecord[],
  next: PrefillRecord,
): PrefillRecord[] {
  const without = records.filter((record) => record.templateKey !== next.templateKey);
  const updated = [...without, next];
  updated.sort((a, b) => a.savedAt - b.savedAt);
  if (updated.length <= PREFILL_TEMPLATE_CAP) return updated;
  return updated.slice(updated.length - PREFILL_TEMPLATE_CAP);
}

export const usePrefillStore = create<PrefillState>()(
  persist(
    (set, get) => ({
      records: [],
      layoutsByDoc: {},
      dismissedDocIds: [],
      rememberLayout: (docPath, pageSize, fields) =>
        set((state) => ({
          layoutsByDoc: { ...state.layoutsByDoc, [docPath]: { pageSize, fields } },
        })),
      recordFill: (docPath, pending, now = Date.now()) => {
        const layout = get().layoutsByDoc[docPath];
        if (layout === undefined || layout.fields.length === 0) return;
        const values = valuesFromLatestFill(layout.fields, pending);
        if (Object.keys(values).length === 0) return;
        const key = templateKey(layout.pageSize, layout.fields);
        set((state) => ({
          records: upsertRecord(state.records, {
            templateKey: key,
            savedAt: now,
            values,
          }),
        }));
      },
      recordForTemplate: (key) => get().records.find((record) => record.templateKey === key),
      dismissOffer: (docPath) =>
        set((state) =>
          state.dismissedDocIds.includes(docPath)
            ? state
            : { dismissedDocIds: [...state.dismissedDocIds, docPath] },
        ),
      isDismissed: (docPath) => get().dismissedDocIds.includes(docPath),
    }),
    {
      name: PREFILL_STORE_KEY,
      partialize: (state) => ({ records: state.records }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<Pick<PrefillState, "records">> | undefined),
      }),
    },
  ),
);
