// Plan 062 T1.5 + D: pure geometry for the left page panel. The strip
// letterboxes each page into a fixed box (aspect ratio kept, no overflow)
// and maps a stacked-page scroll offset to a 0-based page index.

export const THUMBNAIL_STRIP_WIDTH = 160;
export const THUMBNAIL_COLLAPSED_WIDTH = 36;
export const THUMBNAIL_BOX_WIDTH = 128;
export const THUMBNAIL_BOX_HEIGHT = 100;
export const THUMBNAIL_LABEL_HEIGHT = 20;
export const THUMBNAIL_ROW_PADDING = 8;
export const THUMBNAIL_HEADER_HEIGHT = 32;
export const THUMBNAIL_ROW_HEIGHT =
  THUMBNAIL_BOX_HEIGHT + THUMBNAIL_LABEL_HEIGHT + THUMBNAIL_ROW_PADDING * 2;

export interface FittedSize {
  width: number;
  height: number;
  scale: number;
}

/** Contain-fit: the largest size that sits inside `box` with the page's
 * aspect ratio. Never overflows; a zero page or box yields a zero size. */
export function fitThumbnailSize(
  pageWidth: number,
  pageHeight: number,
  boxWidth: number,
  boxHeight: number,
): FittedSize {
  if (pageWidth <= 0 || pageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }
  const scale = Math.min(boxWidth / pageWidth, boxHeight / pageHeight);
  return {
    width: pageWidth * scale,
    height: pageHeight * scale,
    scale,
  };
}

/** 0-based page whose equal-height slot contains `scrollTop`. */
export function pageIndexFromScroll(
  scrollTop: number,
  pageStride: number,
  pageCount: number,
): number {
  if (pageCount <= 1 || pageStride <= 0) return 0;
  return Math.min(pageCount - 1, Math.max(0, Math.floor(scrollTop / pageStride)));
}

/** Scroll offset that puts `pageIndex` at the top of a stacked-page view. */
export function scrollTopForPage(pageIndex: number, pageStride: number): number {
  if (pageIndex <= 0 || pageStride <= 0) return 0;
  return pageIndex * pageStride;
}
