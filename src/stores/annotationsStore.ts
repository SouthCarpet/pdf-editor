// Phase 12 Task 67 — Annotations Zustand store (Delta U).
//
// Keyed by absolute document path. Each entry carries a client-side UUID
// (`__clientId`) for list-key stability; that field is stripped before
// serializing to the Rust command schema.
import { create } from "zustand";
import type { Annotation } from "@/bindings";

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

interface AnnotationsState {
  mode: AnnotationMode;
  byDoc: Record<string, ClientAnnotation[]>;
  setMode: (m: AnnotationMode) => void;
  add: (docPath: string, ann: Annotation) => void;
  remove: (docPath: string, clientId: string) => void;
  replace: (docPath: string, list: ClientAnnotation[]) => void;
  clear: (docPath: string) => void;
}

export const useAnnotations = create<AnnotationsState>((set) => ({
  mode: "highlight",
  byDoc: {},
  setMode: (mode) => set({ mode }),
  add: (docPath, ann) =>
    set((s) => ({
      byDoc: {
        ...s.byDoc,
        [docPath]: [
          ...(s.byDoc[docPath] ?? []),
          { ...ann, __clientId: crypto.randomUUID() } as ClientAnnotation,
        ],
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
