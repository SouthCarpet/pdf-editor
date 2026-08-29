// Plan 062 T1.1: one function for the Delete key, the strip's Odstrániť
// button, and the tests. Removing the pending FreeText is the store's job;
// clearing the filled mark is `unmarkFieldForClientId` so the detected
// box stays and can be filled again.
import { unmarkFieldForClientId, type FilledFieldsState } from "./filledFieldsState";

export function deletePendingAnnotation(args: {
  remove: (docPath: string, clientId: string) => void;
  filled: FilledFieldsState;
  docPath: string;
  pageKey: string;
  clientId: string;
}): FilledFieldsState {
  args.remove(args.docPath, args.clientId);
  return unmarkFieldForClientId(args.filled, args.pageKey, args.clientId);
}
