import type { Annotation, DetectedFormField } from "@/bindings";
import { buildFreeText } from "./detectedFieldGeometry";
import { nextField, type FieldDirection } from "./fieldOrder";
import { markFieldFilled, type FilledFieldsState } from "./filledFieldsState";

interface FieldSelectionArgs {
  field: DetectedFormField;
  filled: FilledFieldsState;
  pageKey: string;
  docPath: string;
  addAnnotation: (docPath: string, annotation: Annotation) => string;
}

export interface FieldSelection {
  field: DetectedFormField;
  clientId: string;
  filled: FilledFieldsState;
}

/** Selects an existing fill or creates the empty pending fill a user will edit. */
export function selectDetectedField({
  field,
  filled,
  pageKey,
  docPath,
  addAnnotation,
}: FieldSelectionArgs): FieldSelection {
  const existingClientId = Object.entries(filled.fieldIdByClientId).find(
    ([, fieldId]) => fieldId === field.id,
  )?.[0];
  if (filled.key === pageKey && existingClientId !== undefined) {
    return { field, clientId: existingClientId, filled };
  }

  const clientId = addAnnotation(docPath, buildFreeText(field, ""));
  return {
    field,
    clientId,
    filled: markFieldFilled(filled, pageKey, field.id, clientId),
  };
}

interface AdjacentFieldSelectionArgs extends Omit<FieldSelectionArgs, "field"> {
  fields: readonly DetectedFormField[];
  currentId: string;
  direction: FieldDirection;
}

export function selectAdjacentField({
  fields,
  currentId,
  direction,
  ...selectionArgs
}: AdjacentFieldSelectionArgs): FieldSelection | null {
  const field = nextField(fields, currentId, direction);
  return field === null ? null : selectDetectedField({ ...selectionArgs, field });
}
