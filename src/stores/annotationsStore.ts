// Phase 12 Task 67 - Annotations Zustand store (Delta U).
//
// Keyed by absolute document path. Each entry carries a client-side UUID
// (`__clientId`) for list-key stability; that field is stripped before
// serializing to the Rust command schema.
import { create } from "zustand";
import type { Annotation } from "@/bindings";

type FreeTextAnnotation = Extract<Annotation, { type: "free_text" }>;

export type AnnotationMode =
  | "highlight"
  | "note"
  | "square"
  | "circle"
  | "line"
  | "freetext"
  | "stamp"
  | "ink";

export type ClientAnnotation = Annotation & { __clientId: string };

// Shared empty result for documents with no annotations yet. A selector that
// returns a fresh `[]` gives useSyncExternalStore a new snapshot on every read,
// which React 19 retries until it reports "Maximum update depth exceeded"
// (React error #185). One stable reference keeps the snapshot equal.
// Frozen so a shared mutation fails loudly instead of leaking into every
// document that has no annotations (verifier finding, plan 050).
export const NO_ANNOTATIONS: ClientAnnotation[] = Object.freeze(
  [] as ClientAnnotation[],
) as unknown as ClientAnnotation[];

interface AnnotationsState {
  mode: AnnotationMode;
  byDoc: Record<string, ClientAnnotation[]>;
  setMode: (m: AnnotationMode) => void;
  /** Returns the generated client id, so a caller can select the new item
   * for immediate editing (Plan 050 task D2-UX, R2). */
  add: (docPath: string, ann: Annotation) => string;
  /** Partial update of a pending FreeText annotation (font size, colour,
   * text, rect) - the only kind the live-preview control strip edits. */
  update: (docPath: string, clientId: string, patch: Partial<FreeTextAnnotation>) => void;
  remove: (docPath: string, clientId: string) => void;
  replace: (docPath: string, list: ClientAnnotation[]) => void;
  clear: (docPath: string) => void;
}

export const useAnnotations = create<AnnotationsState>((set) => ({
  mode: "highlight",
  byDoc: {},
  setMode: (mode) => set({ mode }),
  add: (docPath, ann) => {
    const clientId = crypto.randomUUID();
    set((s) => ({
      byDoc: {
        ...s.byDoc,
        [docPath]: [
          ...(s.byDoc[docPath] ?? []),
          { ...ann, __clientId: clientId } as ClientAnnotation,
        ],
      },
    }));
    return clientId;
  },
  update: (docPath, clientId, patch) =>
    set((s) => ({
      byDoc: {
        ...s.byDoc,
        [docPath]: (s.byDoc[docPath] ?? []).map((a) =>
          a.__clientId === clientId ? ({ ...a, ...patch } as ClientAnnotation) : a,
        ),
      },
    })),
  remove: (docPath, clientId) =>
    set((s) => ({
      byDoc: {
        ...s.byDoc,
        [docPath]: (s.byDoc[docPath] ?? []).filter(
          (a) => a.__clientId !== clientId,
        ),
      },
    })),
  replace: (docPath, list) =>
    set((s) => ({ byDoc: { ...s.byDoc, [docPath]: list } })),
  clear: (docPath) =>
    set((s) => ({ byDoc: { ...s.byDoc, [docPath]: [] } })),
}));
