// Plan 119 p1c: in book mode the facing page of the spread shows the same
// pending values as the focused page. Before, only the focused page got an
// overlay, so a filled value vanished from half of the visible spread.
import type { CSSProperties, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type * as pdfjs from "pdfjs-dist";
import type { PageViewport } from "pdfjs-dist";
import type { Annotation } from "@/bindings";
import type { ClientAnnotation } from "@/stores/annotationsStore";

const captured = vi.hoisted(() => ({
  stageStyles: [] as CSSProperties[],
  texts: [] as string[],
  viewer: [] as { pageIndex: number; hiddenAnnotationIds?: readonly string[] }[],
}));

vi.mock("react-konva", () => ({
  Stage: ({ children, style }: { children?: ReactNode; style: CSSProperties }) => {
    captured.stageStyles.push(style);
    return <>{children}</>;
  },
  Layer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Group: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Rect: () => null,
  Text: ({ text }: { text: string }) => {
    captured.texts.push(text);
    return null;
  },
  Image: () => null,
}));

vi.mock("../PdfViewer", () => ({
  PdfViewer: (props: { pageIndex: number; hiddenAnnotationIds?: readonly string[] }) => {
    captured.viewer.push(props);
    return <canvas data-testid={`page-${props.pageIndex}`} />;
  },
}));

import { BookFacingPage } from "../BookFacingPage";

const viewport = {
  scale: 1,
  viewBox: [0, 0, 612, 792],
  convertToViewportRectangle: ([x0, y0, x1, y1]: number[]) => [x0, 792 - y0, x1, 792 - y1],
  convertToPdfPoint: (x: number, y: number) => [x, 792 - y],
} as unknown as PageViewport;

const pdf = {} as pdfjs.PDFDocumentProxy;

type FreeText = Extract<Annotation, { type: "free_text" }>;

function freeText(page: number, contents: string): ClientAnnotation {
  const base: FreeText = {
    type: "free_text",
    page,
    rect: [100, 600, 200, 624],
    contents,
    style: {
      font_family: "Helvetica",
      font_postscript_name: "Helvetica",
      size_pt: 12,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      color: [0, 0, 0],
      background: null,
      align: "left",
      vertical_align: "top",
      letter_spacing: 0,
      line_height_multiplier: 1.2,
    },
    background_fill: null,
    border_color: [0, 0, 0],
    border_width: 0,
    auto_resize: false,
  };
  return { ...base, __clientId: `client-${page}` };
}

const FORM_VALUE = { fieldId: "10:0", page: 3, rect: [36, 700, 240, 724] as [number, number, number, number], text: "Bob" };

function renderPage(overrides: Partial<Parameters<typeof BookFacingPage>[0]> = {}) {
  return render(
    <BookFacingPage
      pdf={pdf}
      pageIndex={3}
      zoom={1}
      size={{ width: 612, height: 792 }}
      baseSize={{ width: 612, height: 792 }}
      viewport={viewport}
      pendingAnnotations={[]}
      formValues={[]}
      hiddenAnnotationIds={[]}
      onSelect={() => {}}
      {...overrides}
    />,
  );
}

describe("BookFacingPage", () => {
  beforeEach(() => {
    captured.stageStyles.length = 0;
    captured.texts.length = 0;
    captured.viewer.length = 0;
  });

  it("draws the pending values of its own page, read-only", () => {
    renderPage({
      pendingAnnotations: [freeText(3, "Facing value"), freeText(2, "Focused value")],
      formValues: [FORM_VALUE, { ...FORM_VALUE, fieldId: "11:0", page: 2, text: "Elsewhere" }],
    });

    expect(captured.texts).toEqual(["Facing value", "Bob"]);
    expect(captured.stageStyles.map((style) => style.pointerEvents)).toEqual(["none"]);
  });

  it("mounts no overlay when the page has no pending value", () => {
    renderPage({ pendingAnnotations: [freeText(2, "Focused value")] });

    expect(captured.stageStyles).toEqual([]);
    expect(screen.getByTestId("page-3")).toBeInTheDocument();
  });

  it("mounts no overlay before the page is measured", () => {
    renderPage({ viewport: null, pendingAnnotations: [freeText(3, "Facing value")] });

    expect(captured.stageStyles).toEqual([]);
  });

  it("hides the saved values a pending edit replaces, as the focused page does", () => {
    renderPage({ hiddenAnnotationIds: ["12R"] });

    expect(captured.viewer.at(-1)?.hiddenAnnotationIds).toEqual(["12R"]);
  });

  it("makes its page the focused one on click", () => {
    const onSelect = vi.fn();
    const view = renderPage({ onSelect });

    fireEvent.click(view.container.firstElementChild as Element);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
