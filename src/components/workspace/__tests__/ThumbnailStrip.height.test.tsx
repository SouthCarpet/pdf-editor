import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ThumbnailStrip } from "../ThumbnailStrip";
import {
  THUMBNAIL_HEADER_HEIGHT,
  THUMBNAIL_ROW_HEIGHT,
} from "../thumbnailLayout";

vi.mock("../PdfViewer", () => ({ PdfViewer: () => <div /> }));

const PAGES = 12;
let asideHeight = 0;
let notify: (() => void) | null = null;

class FakeResizeObserver {
  constructor(callback: () => void) {
    notify = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === "NAV" ? asideHeight : 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  notify = null;
});

function renderStrip() {
  const pdf = { numPages: PAGES } as unknown as PDFDocumentProxy;
  render(
    <ThumbnailStrip
      pdf={pdf}
      active={0}
      bookMode={false}
      onSelect={() => {}}
      collapsed={false}
      onToggleCollapsed={() => {}}
    />,
  );
  return screen.getByRole("list");
}

it("sizes the list from the measured aside height, not the window", async () => {
  asideHeight = 500;
  window.innerHeight = 900;
  const list = renderStrip();
  await act(async () => {});
  expect(list.style.height).toBe(`${asideHeight - THUMBNAIL_HEADER_HEIGHT}px`);
});

it("keeps the last row inside the aside when the list is scrolled to its end", async () => {
  asideHeight = 500;
  const list = renderStrip();
  await act(async () => {});
  const listHeight = parseFloat(list.style.height);
  const contentHeight = PAGES * THUMBNAIL_ROW_HEIGHT;
  const maxScrollTop = Math.max(0, contentHeight - listHeight);
  const lastRowBottomInList = contentHeight - maxScrollTop;
  expect(THUMBNAIL_HEADER_HEIGHT + listHeight).toBeLessThanOrEqual(asideHeight);
  expect(lastRowBottomInList).toBeLessThanOrEqual(listHeight);
});

it("follows the aside when the search panel takes space away", async () => {
  asideHeight = 500;
  const list = renderStrip();
  await act(async () => {});
  asideHeight = 452;
  await act(async () => notify?.());
  expect(list.style.height).toBe(`${asideHeight - THUMBNAIL_HEADER_HEIGHT}px`);
});
