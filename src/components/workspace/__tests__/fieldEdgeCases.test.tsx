// Plan 119 p1b defect 4: Fill form edge cases the first lane did not cover.
// Zoom levels, a value moved partly off the page, and a value longer than
// its cell.
//
// `react-konva` cannot mount in jsdom (no canvas), and a real pdf.js
// `PageViewport` needs `DOMMatrix`. As in `PendingFreeTextLayer.test.tsx`,
// Konva shapes are mocked to capture their props, and `FakeViewport` does
// pdf.js's rotation-0 transform (scale plus Y flip) with plain arithmetic.
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { PageViewport } from "pdfjs-dist";
import type { DetectedFormField } from "@/bindings";
import type { ClientAnnotation } from "@/stores/annotationsStore";

const shapes = vi.hoisted(() => ({ rects: [] as Record<string, unknown>[], groups: [] as Record<string, unknown>[] }));

vi.mock("react-konva", () => ({
  Group: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
    shapes.groups.push(props);
    return <>{children}</>;
  },
  Rect: (props: Record<string, unknown>) => {
    shapes.rects.push(props);
    return null;
  },
  Text: () => null,
}));

import { DetectedFieldsGroup } from "../DetectedFieldsOverlay";
import { PendingFreeTextLayer } from "../PendingFreeTextLayer";
import { buildFreeText } from "../detectedFieldGeometry";

const PAGE: [number, number, number, number] = [0, 0, 612, 792];

class FakeViewport {
  viewBox = PAGE;
  constructor(public scale: number) {}
  convertToViewportRectangle([x0, y0, x1, y1]: number[]): number[] {
    return [x0 * this.scale, (792 - y0) * this.scale, x1 * this.scale, (792 - y1) * this.scale];
  }
  convertToPdfPoint(x: number, y: number): number[] {
    return [x / this.scale, 792 - y / this.scale];
  }
}

const viewport = (scale: number) => new FakeViewport(scale) as unknown as PageViewport;
const CELL: DetectedFormField = {
  id: "0:0",
  page_index: 0,
  rect: [97, 626, 153, 640],
  kind: "box",
  confidence: 0.9,
};

function value(contents: string, rect = CELL.rect): ClientAnnotation {
  return { ...buildFreeText({ ...CELL, rect }, contents), __clientId: "v1" } as ClientAnnotation;
}

function box(props: Record<string, unknown> | undefined) {
  return { x: props?.x, y: props?.y, width: props?.width, height: props?.height };
}

function renderValue(annotation: ClientAnnotation, scale: number, onRectChange = vi.fn()) {
  shapes.rects.length = 0;
  shapes.groups.length = 0;
  render(
    <PendingFreeTextLayer
      page={0}
      viewport={viewport(scale)}
      annotations={[annotation]}
      selectedId="v1"
      onSelect={() => {}}
      onRectChange={onRectChange}
    />,
  );
  return onRectChange;
}

describe("Fill form at every zoom level", () => {
  it.each([0.5, 1, 2, 4])("keeps the field and its value on the cell at %s", (scale) => {
    const expected = { x: 97 * scale, y: 152 * scale, width: 56 * scale, height: 14 * scale };

    shapes.rects.length = 0;
    render(<DetectedFieldsGroup fields={[CELL]} viewport={viewport(scale)} filledIds={new Set()} onPick={() => {}} />);
    expect(box(shapes.rects[0])).toEqual(expected);

    renderValue(value("07:00"), scale);
    expect(box(shapes.rects.find((rect) => rect.name === "pending-value"))).toEqual(expected);
  });
});

describe("a value moved partly off the page", () => {
  it("is clamped back onto the page with its size kept", () => {
    const onRectChange = renderValue(value("07:00"), 2);
    const body = shapes.rects.find((rect) => rect.name === "pending-value");
    const onDragEnd = body?.onDragEnd as (event: KonvaEventObject<DragEvent>) => void;

    // Screen x 1200 = 600 pt: 44 pt of the 56 pt wide value past the right edge.
    onDragEnd({ target: { x: () => 1200, y: () => 304 } } as unknown as KonvaEventObject<DragEvent>);

    expect(onRectChange).toHaveBeenCalledWith("v1", [556, 626, 612, 640]);
  });
});

describe("a value longer than its cell", () => {
  it("is clipped to the cell in the overlay, not drawn over the neighbours", () => {
    renderValue(value("Hlavna ulica 5, 943 01 Sturovo, Slovenska republika"), 2);

    const clip = shapes.groups.find((group) => group.name === "pending-value-clip");
    expect(clip).toMatchObject({ clipX: 194, clipY: 304, clipWidth: 112, clipHeight: 28 });
  });
});
