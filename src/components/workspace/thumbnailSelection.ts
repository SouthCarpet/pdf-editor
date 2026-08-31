import { spreadFor } from "./pagePairs";

export interface ThumbnailSelection {
  highlighted: boolean;
  focused: boolean;
}

/** Pure thumbnail state: a spread is highlighted, but only one page is focused. */
export function thumbnailSelection(
  pageIndex: number,
  activePage: number,
  pageCount: number,
  bookMode: boolean,
): ThumbnailSelection {
  const focused = pageIndex === activePage;
  if (!bookMode) return { highlighted: focused, focused };
  const spread = spreadFor(activePage, pageCount);
  return { highlighted: spread?.includes(pageIndex) ?? false, focused };
}
