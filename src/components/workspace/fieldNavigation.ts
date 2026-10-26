import type { DetectedFormField } from "@/bindings";
import type { NewAnnotation } from "@/stores/annotationsStore";
import { buildFreeText } from "./detectedFieldGeometry";
import { nextField, type FieldDirection } from "./fieldOrder";
import { markFieldFilled, type FilledFieldsState } from "./filledFieldsState";
import { savedValueInField, type SavedFreeText } from "./savedFieldValues";

interface FieldSelectionArgs {
  field: DetectedFormField;
  filled: FilledFieldsState;
  pageKey: string;
  docPath: string;
  addAnnotation: (docPath: string, annotation: NewAnnotation) => string;
  /** Values already saved in the page on screen (plan 119 p1b). */
  saved?: readonly SavedFreeText[];
}

export interface FieldSelection {
  field: DetectedFormField;
  clientId: string;
  filled: FilledFieldsState;
}

/** Selects an existing fill or creates the pending fill a user will edit.
 * Plan 119 p1b: a cell never gets a second value. A pending value of the
 * cell is selected on any page key (field ids carry their page). A saved
 * value of the cell is edited: the new pending value starts from it and
 * replaces it on save. */
export function selectDetectedField({
  field,
  filled,
  pageKey,
  docPath,
  addAnnotation,
  saved = [],
}: FieldSelectionArgs): FieldSelection {
  const existingClientId = Object.entries(filled.fieldIdByClientId).find(
    ([, fieldId]) => fieldId === field.id,
  )?.[0];
  if (existingClientId !== undefined) {
    return { field, clientId: existingClientId, filled: { ...filled, key: pageKey } };
  }

  const clientId = addAnnotation(docPath, newFill(field, savedValueInField(field, saved)));
  return {
    field,
    clientId,
    filled: markFieldFilled(filled, pageKey, field.id, clientId),
  };
}

function newFill(field: DetectedFormField, saved: SavedFreeText | undefined): NewAnnotation {
  if (saved === undefined || saved.ref === null) return buildFreeText(field, "");
  const annotation = buildFreeText({ ...field, rect: saved.rect }, saved.contents);
  if (annotation.type !== "free_text") return annotation;
  const size_pt = saved.sizePt ?? annotation.style.size_pt;
  return { ...annotation, style: { ...annotation.style, size_pt }, __replaces: saved.ref };
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
