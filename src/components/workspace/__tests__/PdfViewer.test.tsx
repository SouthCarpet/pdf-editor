// Plan 119 p1b defect 1: while a saved value is being edited, the page
// must not draw the old saved value under the edit. pdf.js skips an
// annotation whose annotation-storage entry says `noView`, when the page is
// rendered with `AnnotationMode.ENABLE_STORAGE` (3).
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type * as pdfjs from "pdfjs-dist";
import { PdfViewer } from "../PdfViewer";

function fakePdf() {
  const storage = new Map<string, unknown>();
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: () => {} }));
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render,
  };
  const pdf = {
    annotationStorage: {
      setValue: (id: string, value: unknown) => storage.set(id, value),
      remove: (id: string) => storage.delete(id),
    },
    getPage: async () => page,
  } as unknown as pdfjs.PDFDocumentProxy;
  return { pdf, storage, render };
}

describe("PdfViewer hidden annotations", () => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;

  it("hides the saved values being edited and shows them again after", async () => {
    const { pdf, storage, render: renderPage } = fakePdf();
    const view = render(<PdfViewer pdf={pdf} pageIndex={0} zoom={1} hiddenAnnotationIds={["12R"]} />);

    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    expect(renderPage).toHaveBeenLastCalledWith(expect.objectContaining({ annotationMode: 3 }));
    expect(storage.get("12R")).toEqual({ noView: true });

    view.rerender(<PdfViewer pdf={pdf} pageIndex={0} zoom={1} hiddenAnnotationIds={[]} />);

    await waitFor(() => expect(storage.has("12R")).toBe(false));
  });

  // Plan 119 p1c: book mode shows two pages of one document. Both hide the
  // value being edited, and the storage entry is shared. One page leaving
  // the spread must not show the old value again on the other.
  it("keeps a shared id hidden until the last page that hides it is gone", async () => {
    const { pdf, storage, render: renderPage } = fakePdf();
    const focused = render(
      <PdfViewer pdf={pdf} pageIndex={0} zoom={1} hiddenAnnotationIds={["12R"]} />,
    );
    const facing = render(
      <PdfViewer pdf={pdf} pageIndex={1} zoom={1} hiddenAnnotationIds={["12R"]} />,
    );
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));

    facing.unmount();
    expect(storage.get("12R")).toEqual({ noView: true });

    focused.unmount();
    expect(storage.has("12R")).toBe(false);
  });
});
