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

class FakeViewport {
  scale = 1;
  constructor(private pageHeight = 792) {}
  convertToViewportRectangle(rect: number[]): number[] {
    const [x0, y0, x1, y1] = rect;
    return [
      x0 * this.scale,
      (this.pageHeight - y0) * this.scale,
      x1 * this.scale,
      (this.pageHeight - y1) * this.scale,
    ];
  }
  convertToPdfPoint(x: number, y: number): number[] {
    return [x / this.scale, this.pageHeight - y / this.scale];
  }
}
function makeViewport(): PageViewport {
  return new FakeViewport() as unknown as PageViewport;
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
