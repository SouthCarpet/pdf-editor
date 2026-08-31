export type PagePair = readonly [left: number | null, right: number | null];

/** Builds zero-based facing-page spreads with the cover alone on the right. */
export function pagePairs(count: number): PagePair[] {
  const pageCount = Math.max(0, Math.floor(count));
  if (pageCount === 0) return [];

  const pairs: PagePair[] = [[null, 0]];
  for (let left = 1; left < pageCount; left += 2) {
    pairs.push([left, left + 1 < pageCount ? left + 1 : null]);
  }
  return pairs;
}

/** Returns the zero-based spread index containing `pageIndex`, or -1. */
export function spreadIndexOf(pageIndex: number, count: number): number {
  const pageCount = Math.max(0, Math.floor(count));
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) return -1;
  return pageIndex === 0 ? 0 : Math.floor((pageIndex + 1) / 2);
}

/** Returns the spread containing `pageIndex`, or null for an invalid page. */
export function spreadFor(pageIndex: number, count: number): PagePair | null {
  const spreadIndex = spreadIndexOf(pageIndex, count);
  return spreadIndex < 0 ? null : (pagePairs(count)[spreadIndex] ?? null);
}
