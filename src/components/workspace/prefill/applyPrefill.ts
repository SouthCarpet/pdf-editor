import type { DetectedFormField } from "@/bindings";
import { linkAnnotationToFilledField } from "@/stores/annotationHistory";
import { useAnnotations } from "@/stores/annotationsStore";
import { filledMarksFor, useFilledFields } from "@/stores/filledFieldsStore";
import { selectDetectedField } from "../fieldNavigation";
import { markFieldFilled, unmarkFieldForClientId } from "../filledFieldsState";

/** Creates pending fills through `selectDetectedField` (the click path) and writes the remembered text. */
export function applyPrefillFills({
  docPath,
  pageKey,
  fields,
  valuesByFieldId,
}: {
  docPath: string;
  pageKey: string;
  fields: readonly DetectedFormField[];
  valuesByFieldId: Record<string, string>;
}): void {
  const addAnnotation = useAnnotations.getState().add;
  const update = useAnnotations.getState().update;
  let filled = filledMarksFor(docPath);

  for (const field of fields) {
    const text = valuesByFieldId[field.id];
    if (text === undefined) continue;
    const selection = selectDetectedField({
      field,
      filled,
      pageKey,
      docPath,
      addAnnotation,
    });
    filled = selection.filled;
    update(docPath, selection.clientId, { contents: text });
    linkAnnotationToFilledField(docPath, selection.clientId, {
      mark: () =>
        useFilledFields.getState().setFilled(docPath, (current) =>
          markFieldFilled(current, pageKey, field.id, selection.clientId),
        ),
      unmark: () =>
        useFilledFields.getState().setFilled(docPath, (current) =>
          unmarkFieldForClientId(current, pageKey, selection.clientId),
        ),
    });
  }

  useFilledFields.getState().setFilled(docPath, filled);
}
