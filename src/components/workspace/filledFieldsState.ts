// Plan 050 task D2-UX-2 (R7b): tracking which detected fields are "filled".
//
// `Workspace` shows a detected field as filled once the user submits a
// value for it (`DetectedFieldFill`), which creates a pending FreeText
// annotation. The regression: deleting that annotation (from
// `PendingAnnotationControls`) left the field's id in `filledIds`, so the
// field kept showing as filled even though nothing backed it any more.
//
// Pure, dependency-free state transitions so they are testable without
// mounting the Konva overlay. `key` mirrors the `${path}\0${page}` key the
// rest of `Workspace.tsx` already uses to invalidate state on a page or
// document switch.
export interface FilledFieldsState {
  key: string;
  ids: Set<string>;
  fieldIdByClientId: Record<string, string>;
}

export const EMPTY_FILLED_FIELDS: FilledFieldsState = {
  key: "",
  ids: new Set(),
  fieldIdByClientId: {},
};

/** Records that `fieldId` is now filled by the annotation `clientId`. */
export function markFieldFilled(
  current: FilledFieldsState,
  key: string,
  fieldId: string,
  clientId: string,
): FilledFieldsState {
  const base = current.key === key ? current : { key, ids: new Set<string>(), fieldIdByClientId: {} };
  return {
    key,
    ids: new Set(base.ids).add(fieldId),
    fieldIdByClientId: { ...base.fieldIdByClientId, [clientId]: fieldId },
  };
}

/** Un-marks whichever field `clientId` was filling, if any. A no-op for a
 * stale key (a page/document switch already invalidated the state) or a
 * `clientId` that was never tracked (a manually-added annotation, not a
 * detected-field fill). */
export function unmarkFieldForClientId(
  current: FilledFieldsState,
  key: string,
  clientId: string,
): FilledFieldsState {
  if (current.key !== key) return current;
  const fieldId = current.fieldIdByClientId[clientId];
  if (fieldId === undefined) return current;
  const ids = new Set(current.ids);
  ids.delete(fieldId);
  const fieldIdByClientId = { ...current.fieldIdByClientId };
  delete fieldIdByClientId[clientId];
  return { key, ids, fieldIdByClientId };
}
