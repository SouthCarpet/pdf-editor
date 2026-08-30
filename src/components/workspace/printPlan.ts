export type PrintContent = "filled" | "original";

export interface PrintOptions {
  content: PrintContent;
  printAsImage: boolean;
  booklet: boolean;
  reverse: boolean;
}

export type PrintSheet<T> = readonly [T | null, T | null];

export interface PrintPlan {
  source: PrintContent;
  /** Direction 1 always rasterises. The disabled UI switch states this honestly. */
  rasterize: true;
  slotsPerSheet: 1 | 2;
  sheets: PrintSheet<number>[];
  pageCount: number;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  content: "filled",
  printAsImage: true,
  booklet: false,
  reverse: false,
};

export function reversePages<T>(pages: readonly T[]): T[] {
  return pages.toReversed();
}

/**
 * Imposes logical pages as booklet sheet sides, from the outside inward.
 * Missing pages are represented by `null` after padding to a multiple of four.
 */
export function bookletOrder<T>(pages: readonly T[]): PrintSheet<T>[] {
  if (pages.length === 0) return [];

  const padded: Array<T | null> = [...pages];
  while (padded.length % 4 !== 0) padded.push(null);

  const sides: PrintSheet<T>[] = [];
  let left = 0;
  let right = padded.length - 1;
  while (left < right) {
    sides.push([padded[right], padded[left]]);
    left += 1;
    right -= 1;
    sides.push([padded[left], padded[right]]);
    left += 1;
    right -= 1;
  }
  return sides;
}

export function buildPrintPlan(options: PrintOptions, pageCount: number): PrintPlan {
  const count = Math.max(0, Math.floor(pageCount));
  const sourcePages = Array.from({ length: count }, (_, index) => index + 1);
  const logicalPages = options.reverse ? reversePages(sourcePages) : sourcePages;

  return {
    source: options.content,
    // The selected direction has one deterministic raster pipeline. Keep
    // this true even if a caller supplies stale state with the switch off.
    rasterize: true,
    slotsPerSheet: options.booklet ? 2 : 1,
    sheets: options.booklet
      ? bookletOrder(logicalPages)
      : logicalPages.map((page): PrintSheet<number> => [page, null]),
    pageCount: count,
  };
}
