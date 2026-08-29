export interface ScrollPosition {
  offset: number;
  scrollSize: number;
  viewportSize: number;
}

export interface ScrollTarget {
  scrollSize: number;
  viewportSize: number;
}

/** Maps one scrollable pane's progress onto a pane with different dimensions. */
export function mapSyncedScrollPosition(
  source: ScrollPosition,
  target: ScrollTarget,
): number {
  const sourceRange = Math.max(0, source.scrollSize - source.viewportSize);
  const targetRange = Math.max(0, target.scrollSize - target.viewportSize);
  if (sourceRange === 0 || targetRange === 0) return 0;

  const progress = Math.min(1, Math.max(0, source.offset / sourceRange));
  return progress * targetRange;
}
