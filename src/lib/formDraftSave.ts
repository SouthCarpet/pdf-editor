// Plan 119 p1c: the one save for typed AcroForm values. The Forms panel's
// "Save filled copy" button and the shared document save (toolbar, Ctrl+S,
// the close guard) both call it, so a typed value is written the same way
// whichever of them asks.
import { commands, type FormField, type FormValueUpdate } from "@/bindings";
import { useDocuments, type DocId } from "@/stores/documentStore";
import { NO_FORM_DRAFT, useFormDrafts, type FormValues } from "@/stores/formDraftStore";

export type FormDraftSaveResult = { ok: true } | { ok: false; error: unknown };

/** The fields whose value in `values` differs from `baseline`, as updates. */
export function changedFields(
  fields: FormField[] | null,
  values: FormValues,
  baseline: FormValues,
): FormValueUpdate[] {
  if (!fields) return [];
  return fields
    .filter((field) => values[field.id] !== baseline[field.id])
    .map((field) => ({ field_id: field.id, value: values[field.id] ?? null }));
}

export function fieldValues(fields: readonly FormField[]): FormValues {
  return Object.fromEntries(fields.map((field) => [field.id, field.value]));
}

/**
 * Writes the typed values of `docId` into `output`, starting from `input`
 * (the latest saved copy). The values written are the ones typed when the
 * save started: a value typed while the file writes stays unsaved (plan 119
 * p1b). The document then shows `output`, unless no typed value differed
 * from the file and nothing was written.
 */
export async function saveFormDraft(
  docId: DocId,
  input: string,
  output: string,
): Promise<FormDraftSaveResult> {
  const draft = useFormDrafts.getState().byDoc[docId] ?? NO_FORM_DRAFT;
  const read = await commands.readFormFieldsCmd(input);
  if (read.status === "error") return { ok: false, error: read.error };

  const inFile = fieldValues(read.data);
  const written = { ...inFile, ...draft.values };
  const updates = changedFields(read.data, written, inFile);
  if (updates.length > 0) {
    const result = await commands.setFormValuesCmd({
      input,
      output,
      updates,
      job_id: crypto.randomUUID(),
    });
    if (result.status === "error") return { ok: false, error: result.error };
  }
  // Marked before the document switches to the new copy, so the panel never
  // shows the written values as unsaved for a moment.
  useFormDrafts.getState().markSaved(docId, written);
  if (updates.length > 0) useDocuments.getState().setSavedPath(docId, output);
  return { ok: true };
}
