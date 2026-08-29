import type { NodeChange } from "@xyflow/react";

export function selectedNodeAfterChanges(
  changes: NodeChange[],
  currentlySelected: string | null,
): string | null {
  const selectionChanges = changes.filter(
    (change): change is Extract<NodeChange, { type: "select" }> =>
      change.type === "select",
  );
  const selected = selectionChanges.find((change) => change.selected);
  if (selected) return selected.id;
  if (
    selectionChanges.some(
      (change) => !change.selected && change.id === currentlySelected,
    )
  ) {
    return null;
  }
  return currentlySelected;
}
