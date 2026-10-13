// Plan 119 p1: the read-only preview draws every pending value of the page
// and takes no pointer events, so the active tool's own overlay keeps its
// clicks. `react-konva` cannot paint in jsdom (see
// `PendingFreeTextLayer.test.tsx`), so its nodes are mocked to capture
// their props.
import type { CSSProperties, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { PageViewport } from "pdfjs-dist";
import type { Annotation } from "@/bindings";
import type { ClientAnnotation } from "@/stores/annotationsStore";

const captured = vi.hoisted(() => ({
  stageStyles: [] as CSSProperties[],
  texts: [] as string[],
  draggable: [] as unknown[],
}));

vi.mock("react-konva", () => ({
  Stage: ({ children, style }: { children?: ReactNode; style: CSSProperties }) => {
    captured.stageStyles.push(style);
    return <>{children}</>;
  },
  Layer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Group: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Rect: (props: { draggable?: unknown }) => {
    captured.draggable.push(props.draggable);
    return null;
  },
  Text: ({ text }: { text: string }) => {
    captured.texts.push(text);
    return null;
  },
  Image: () => null,
}));

import { EditPageOverlay, PendingPreviewOverlay } from "../EditPageOverlay";
import type { PendingFormValue } from "../pendingFormValues";

const viewport = {
  scale: 1,
  convertToViewportRectangle: ([x0, y0, x1, y1]: number[]) => [x0, 792 - y0, x1, 792 - y1],
  convertToPdfPoint: (x: number, y: number) => [x, 792 - y],
} as unknown as PageViewport;

type FreeText = Extract<Annotation, { type: "free_text" }>;

function freeText(clientId: string, page: number, contents: string): ClientAnnotation {
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
  return { ...base, __clientId: clientId };
}

beforeEach(() => {
  captured.stageStyles.length = 0;
  captured.texts.length = 0;
  captured.draggable.length = 0;
});

describe("PendingPreviewOverlay", () => {
  it("draws this page's pending values without pointer events or drag handles", () => {
    render(
      <PendingPreviewOverlay
        width={612}
        height={792}
        page={0}
        viewport={viewport}
        pendingAnnotations={[
          freeText("a", 0, "Ľubomír Šťastný"),
          freeText("b", 1, "other page"),
        ]}
        formValues={[]}
        pageWidth={612}
        pageHeight={792}
      />,
    );

    expect(captured.texts).toEqual(["Ľubomír Šťastný"]);
    expect(captured.stageStyles.map((style) => style.pointerEvents)).toEqual(["none"]);
    expect(captured.draggable.every((value) => value !== true)).toBe(true);
  });

  // Plan 119 p1c: a typed AcroForm value shows on the page, not only in the
  // panel.
  it("draws this page's typed AcroForm values", () => {
    render(
      <PendingPreviewOverlay
        width={612}
        height={792}
        page={0}
        viewport={viewport}
        pendingAnnotations={[]}
        formValues={[FORM_VALUE, { ...FORM_VALUE, fieldId: "11:0", page: 1, text: "other page" }]}
        pageWidth={612}
        pageHeight={792}
      />,
    );

    expect(captured.texts).toEqual(["Ľubica Šťastná"]);
    expect(captured.stageStyles.map((style) => style.pointerEvents)).toEqual(["none"]);
  });
});

const FORM_VALUE: PendingFormValue = {
  fieldId: "10:0",
  page: 0,
  rect: [36, 700, 240, 724],
  text: "Ľubica Šťastná",
};

describe("EditPageOverlay", () => {
  it("draws the typed AcroForm values beside the pending values", () => {
    render(
      <EditPageOverlay
        width={612}
        height={792}
        page={0}
        viewport={viewport}
        detectedFields={null}
        filledIds={new Set()}
        onPickField={() => {}}
        pendingAnnotations={[freeText("a", 0, "Fill")]}
        formValues={[FORM_VALUE]}
        selectedPendingId={null}
        onSelectPending={() => {}}
        onPendingRectChange={() => {}}
        stampPlacement={null}
        pageWidth={612}
        pageHeight={792}
        onPlaceStamp={() => {}}
      />,
    );

    expect(captured.texts).toEqual(expect.arrayContaining(["Fill", "Ľubica Šťastná"]));
  });
});
