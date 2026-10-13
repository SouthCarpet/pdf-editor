// Plan 119 p1: AcroForm values the user typed in `EditFormsPanel`, per
// document. They live here, not in the panel's state, because switching
// the Edit sub-tool unmounts the panel and lost them. `saved` holds the
// values the last save wrote, so the panel can tell unsaved changes apart
// after it mounts again.
//
// Plan 119 p1c: a value no save wrote is unsaved work. The close guard, the
// toolbar Save, autosave and the page preview all read it from here.
// `places` keeps where each typed field sits (page and rectangle), so the
// page can draw the value without reading the file again.
import { create } from "zustand";
import type { FormField } from "@/bindings";

export type FormValues = Record<string, string | null>;

/** Where a field sits on its page, for the read-only value preview. */
export type FormPlace = Pick<FormField, "kind" | "page_index" | "rect">;

export interface FormDraft {
  values: FormValues;
  saved: FormValues;
  places: Record<string, FormPlace>;
}

/** The part of a draft that no save wrote: what autosave stores. */
export interface DirtyFormDraft {
  values: FormValues;
  places: Record<string, FormPlace>;
}

export const NO_FORM_DRAFT: FormDraft = { values: {}, saved: {}, places: {} };

interface FormDraftStore {
  byDoc: Record<string, FormDraft>;
  setValue: (docPath: string, fieldId: string, value: string | null, place?: FormPlace) => void;
  /** Records the values a save wrote (plan 119 p1b: the values at the
   * moment the save started, not the ones typed while it wrote). */
  markSaved: (docPath: string, written: FormValues) => void;
  /** Drops the draft of one document: after a discard or a close. */
  clear: (docPath: string) => void;
  /** Puts back values an autosave record kept. They are unsaved again. */
  restore: (docPath: string, draft: DirtyFormDraft) => void;
}

export const useFormDrafts = create<FormDraftStore>((set) => ({
  byDoc: {},
  setValue: (docPath, fieldId, value, place) =>
    set((current) => {
      const draft = current.byDoc[docPath] ?? NO_FORM_DRAFT;
      return {
        byDoc: {
          ...current.byDoc,
          [docPath]: {
            ...draft,
            values: { ...draft.values, [fieldId]: value },
            places: place === undefined ? draft.places : { ...draft.places, [fieldId]: place },
          },
        },
      };
    }),
  markSaved: (docPath, written) =>
    set((current) => {
      const draft = current.byDoc[docPath] ?? NO_FORM_DRAFT;
      return { byDoc: { ...current.byDoc, [docPath]: { ...draft, saved: { ...written } } } };
    }),
  clear: (docPath) =>
    set((current) => {
      if (!(docPath in current.byDoc)) return current;
      const { [docPath]: _dropped, ...rest } = current.byDoc;
      void _dropped;
      return { byDoc: rest };
    }),
  restore: (docPath, stored) =>
    set((current) => ({
      byDoc: {
        ...current.byDoc,
        [docPath]: { values: { ...stored.values }, saved: {}, places: { ...stored.places } },
      },
    })),
}));

function isFieldDirty(draft: FormDraft, fieldId: string): boolean {
  return !(fieldId in draft.saved) || draft.values[fieldId] !== draft.saved[fieldId];
}

/** True when a typed value differs from what the last save wrote, or no
 * save wrote it yet. Typing the original value back still counts: the store
 * does not know the file's value, and one extra question is the safe side. */
export function isDraftDirty(draft: FormDraft): boolean {
  return Object.keys(draft.values).some((fieldId) => isFieldDirty(draft, fieldId));
}

export function dirtyFormDraft(draft: FormDraft): DirtyFormDraft {
  const dirtyIds = Object.keys(draft.values).filter((fieldId) => isFieldDirty(draft, fieldId));
  return {
    values: Object.fromEntries(dirtyIds.map((fieldId) => [fieldId, draft.values[fieldId]])),
    places: Object.fromEntries(
      dirtyIds.flatMap((fieldId) => {
        const place = draft.places[fieldId];
        return place === undefined ? [] : [[fieldId, place] as const];
      }),
    ),
  };
}

/** Imperative check for event handlers (close guard, autosave). */
export function hasDirtyFormDraft(docId: string): boolean {
  return isDraftDirty(useFormDrafts.getState().byDoc[docId] ?? NO_FORM_DRAFT);
}

/** Reactive version, for the tab's unsaved-changes dot and the Save button. */
export function useHasDirtyFormDraft(docId: string): boolean {
  return useFormDrafts((state) => isDraftDirty(state.byDoc[docId] ?? NO_FORM_DRAFT));
}
