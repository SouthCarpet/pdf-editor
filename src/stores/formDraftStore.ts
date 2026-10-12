// Plan 119 p1: AcroForm values the user typed in `EditFormsPanel`, per
// document. They live here, not in the panel's state, because switching
// the Edit sub-tool unmounts the panel and lost them. `saved` holds the
// values the last save wrote, so the panel can tell unsaved changes apart
// after it mounts again.
import { create } from "zustand";

export type FormValues = Record<string, string | null>;

export interface FormDraft {
  values: FormValues;
  saved: FormValues;
}

export const NO_FORM_DRAFT: FormDraft = { values: {}, saved: {} };

interface FormDraftStore {
  byDoc: Record<string, FormDraft>;
  setValue: (docPath: string, fieldId: string, value: string | null) => void;
  markSaved: (docPath: string) => void;
}

export const useFormDrafts = create<FormDraftStore>((set) => ({
  byDoc: {},
  setValue: (docPath, fieldId, value) =>
    set((current) => {
      const draft = current.byDoc[docPath] ?? NO_FORM_DRAFT;
      return {
        byDoc: {
          ...current.byDoc,
          [docPath]: { ...draft, values: { ...draft.values, [fieldId]: value } },
        },
      };
    }),
  markSaved: (docPath) =>
    set((current) => {
      const draft = current.byDoc[docPath] ?? NO_FORM_DRAFT;
      return { byDoc: { ...current.byDoc, [docPath]: { ...draft, saved: { ...draft.values } } } };
    }),
}));
