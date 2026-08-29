// Plan 062 T1.5 + D: pure thumbnail-panel geometry. Each expected value
// is the contain-fit / scroll-slot contract, not a copy of the helper.
import { describe, expect, it } from "vitest";
import {
  fitThumbnailSize,
  pageIndexFromScroll,
  scrollTopForPage,
  THUMBNAIL_BOX_HEIGHT,
  THUMBNAIL_BOX_WIDTH,
} from "../thumbnailLayout";

describe("fitThumbnailSize", () => {
  it("scales a portrait A4 page to the box height and keeps the aspect ratio", () => {
    // 595 x 842 pt (A4). Box 128 x 100. Height binds: 100/842 < 128/595.
    const fitted = fitThumbnailSize(595, 842, THUMBNAIL_BOX_WIDTH, THUMBNAIL_BOX_HEIGHT);
    expect(fitted.height).toBe(100);
    expect(fitted.width).toBeCloseTo((595 / 842) * 100, 5);
    expect(fitted.width).toBeLessThanOrEqual(THUMBNAIL_BOX_WIDTH);
    expect(fitted.height).toBeLessThanOrEqual(THUMBNAIL_BOX_HEIGHT);
    expect(fitted.width / fitted.height).toBeCloseTo(595 / 842, 5);
  });

  it("scales a landscape page to the box width and keeps the aspect ratio", () => {
    const fitted = fitThumbnailSize(842, 595, 128, 100);
    expect(fitted.width).toBe(128);
    expect(fitted.height).toBeCloseTo((595 / 842) * 128, 5);
    expect(fitted.width).toBeLessThanOrEqual(128);
    expect(fitted.height).toBeLessThanOrEqual(100);
    expect(fitted.width / fitted.height).toBeCloseTo(842 / 595, 5);
  });

  it("does not overflow a square page in a rectangular box", () => {
    const fitted = fitThumbnailSize(200, 200, 128, 100);
    expect(fitted.width).toBe(100);
    expect(fitted.height).toBe(100);
  });

  it("returns a zero size when the page or the box has no area", () => {
    expect(fitThumbnailSize(0, 842, 128, 100)).toEqual({ width: 0, height: 0, scale: 0 });
    expect(fitThumbnailSize(595, 842, 0, 100)).toEqual({ width: 0, height: 0, scale: 0 });
  });
});

describe("pageIndexFromScroll", () => {
  it("returns page 0 at the top of the stack", () => {
    expect(pageIndexFromScroll(0, 140, 4)).toBe(0);
  });

  it("stays on page 0 until the next slot begins", () => {
    expect(pageIndexFromScroll(139, 140, 4)).toBe(0);
  });

  it("moves to page 1 at the start of the second slot", () => {
    expect(pageIndexFromScroll(140, 140, 4)).toBe(1);
  });

  it("clamps past the last page", () => {
    expect(pageIndexFromScroll(9999, 140, 4)).toBe(3);
  });

  it("clamps a negative scroll offset to page 0", () => {
    expect(pageIndexFromScroll(-20, 140, 4)).toBe(0);
  });

  it("returns page 0 when there are no pages or the stride is not positive", () => {
    expect(pageIndexFromScroll(100, 140, 0)).toBe(0);
    expect(pageIndexFromScroll(100, 0, 4)).toBe(0);
  });
});

describe("scrollTopForPage", () => {
  it("places page 0 at the top", () => {
    expect(scrollTopForPage(0, 140)).toBe(0);
  });

  it("places page 2 two strides down", () => {
    expect(scrollTopForPage(2, 140)).toBe(280);
  });

  it("clamps a negative page index to the top", () => {
    expect(scrollTopForPage(-1, 140)).toBe(0);
  });
});
