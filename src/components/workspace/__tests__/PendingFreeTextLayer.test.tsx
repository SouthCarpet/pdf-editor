// Plan 062 final fix wave F6 regression: a resize handle must commit one
// history entry per drag gesture, not one per `onDragMove` frame.
//
// `react-konva` cannot mount in this project's jsdom - no
// `HTMLCanvasElement#getContext`, confirmed the same way
// `pendingAnnotationGeometry.test.ts` documents for `pdfjs-dist`'s
// `PageViewport`. So `Rect` is mocked to a no-op that hands its props to a
// capture map; this exercises the wiring (which Konva event calls
// `onRectChange`), not painting.
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { PageViewport } from "pdfjs-dist";
import type { Annotation } from "@/bindings";
import type { ClientAnnotation } from "@/stores/annotationsStore";

const captured = vi.hoisted(() => ({} as Record<string, Record<string, unknown>>));

vi.mock("react-konva", () => ({
  Group: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Rect: (props: Record<string, unknown>) => {
    if (typeof props.name === "string") captured[props.name] = props;
    return null;
  },
  Text: () => null,
}));

import { PendingFreeTextLayer } from "../PendingFreeTextLayer";

/** A 612 x 792 pt page at scale 1. Rotation 90 turns it clockwise: screen x
 * follows PDF y and screen y follows PDF x (pdf.js's own mapping). */
class FakeViewport {
  scale = 1;
  viewBox = [0, 0, 612, 792];
  constructor(
    private rotation: 0 | 90 = 0,
    private pageHeight = 792,
  ) {}
  private toScreen(x: number, y: number): [number, number] {
    return this.rotation === 90 ? [y, x] : [x, this.pageHeight - y];
  }
  convertToViewportRectangle(rect: number[]): number[] {
    const [x0, y0, x1, y1] = rect;
    return [...this.toScreen(x0, y0), ...this.toScreen(x1, y1)];
  }
  convertToPdfPoint(x: number, y: number): number[] {
    return this.rotation === 90 ? [y, x] : [x, this.pageHeight - y];
  }
}
function makeViewport(rotation: 0 | 90 = 0): PageViewport {
  return new FakeViewport(rotation) as unknown as PageViewport;
}

type FreeText = Extract<Annotation, { type: "free_text" }>;

function freeText(): ClientAnnotation {
  const base: FreeText = {
    type: "free_text",
    page: 0,
    rect: [100, 600, 200, 624],
    contents: "Meno",
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
  return { ...base, __clientId: "client-1" };
}

function fakeDrag(x: number, y: number): KonvaEventObject<DragEvent> {
  return { target: { x: () => x, y: () => y } } as unknown as KonvaEventObject<DragEvent>;
}

describe("PendingFreeTextLayer resize handles (F6)", () => {
  it("commits one history entry per drag gesture, not per move", () => {
    for (const key of Object.keys(captured)) delete captured[key];
    const onRectChange = vi.fn();

    render(
      <PendingFreeTextLayer
        page={0}
        viewport={makeViewport()}
        annotations={[freeText()]}
        selectedId="client-1"
        onSelect={() => {}}
        onRectChange={onRectChange}
      />,
    );

    const handle = captured["resize-right"];
    expect(handle).toBeDefined();
    const onDragMove = handle.onDragMove as (e: KonvaEventObject<DragEvent>) => void;
    const onDragEnd = handle.onDragEnd as (e: KonvaEventObject<DragEvent>) => void;

    onDragMove(fakeDrag(205, 175));
    onDragMove(fakeDrag(215, 175));
    onDragMove(fakeDrag(225, 175));
    expect(onRectChange).not.toHaveBeenCalled();

    onDragEnd(fakeDrag(235, 175));
    expect(onRectChange).toHaveBeenCalledTimes(1);
    const [clientId, rect] = onRectChange.mock.calls[0] as [string, [number, number, number, number]];
    expect(clientId).toBe("client-1");
    expect(rect[2]).toBeGreaterThan(200); // the dragged (right) edge moved outward
  });
});

// Plan 119 p1c: a resize cannot push a value off the page. Each handle is a
// SCREEN side, so on a page turned 90 degrees it moves another PDF edge.
describe("PendingFreeTextLayer resize handles stay on the page (p1c)", () => {
  type Rect = [number, number, number, number];

  /** Drags the named handle until its position is `value` (screen px) and
   * returns the rect the layer commits. */
  function dragHandle(rotation: 0 | 90, name: string, value: number): Rect {
    for (const key of Object.keys(captured)) delete captured[key];
    const onRectChange = vi.fn();
    render(
      <PendingFreeTextLayer
        page={0}
        viewport={makeViewport(rotation)}
        annotations={[freeText()]}
        selectedId="client-1"
        onSelect={() => {}}
        onRectChange={onRectChange}
      />,
    );
    const onDragEnd = captured[name].onDragEnd as (e: KonvaEventObject<DragEvent>) => void;
    const at = value - 4.5; // the handle is 9 px wide and the layer reads its centre
    onDragEnd(fakeDrag(at, at));
    expect(onRectChange).toHaveBeenCalledTimes(1);
    return onRectChange.mock.calls[0][1] as Rect;
  }

  // The value sits at PDF [100, 600, 200, 624] on a 612 x 792 pt page.
  it.each([
    ["resize-left", -50, [0, 600, 200, 624]],
    ["resize-right", 900, [100, 600, 612, 624]],
    ["resize-top", -40, [100, 600, 200, 792]],
    ["resize-bottom", 900, [100, 0, 200, 624]],
  ] as const)("%s cuts the rect at the page edge", (name, value, expected) => {
    expect(dragHandle(0, name, value)).toEqual(expected);
  });

  it.each([
    ["resize-left", -50, [100, 0, 200, 624]],
    ["resize-right", 900, [100, 600, 200, 792]],
    ["resize-top", -40, [0, 600, 200, 624]],
    ["resize-bottom", 700, [100, 600, 612, 624]],
  ] as const)("%s cuts the rect at the page edge on a page turned 90 degrees", (name, value, expected) => {
    expect(dragHandle(90, name, value)).toEqual(expected);
  });

  it("resizes inside the page as before", () => {
    expect(dragHandle(0, "resize-right", 300)).toEqual([100, 600, 300, 624]);
  });

  it("moves the PDF edge that lies under the handle on a turned page", () => {
    // Screen x follows PDF y on a 90 degree page, so the right handle moves y1.
    expect(dragHandle(90, "resize-right", 700)).toEqual([100, 600, 200, 700]);
  });
});
