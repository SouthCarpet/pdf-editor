// Plan 062 final fix wave F6 regression: a corner resize handle must
// commit one history entry per drag gesture, not one per `onDragMove`
// frame. See `PendingFreeTextLayer.test.tsx` for why `react-konva` is
// mocked instead of mounted (jsdom has no `HTMLCanvasElement#getContext`).
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
  Image: () => null,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn().mockRejectedValue(new Error("no fs in test")) }));

import { PendingStampLayer } from "../PendingStampLayer";

class FakeViewport {
  scale = 1;
  width = 400;
  height = 792;
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

type Stamp = Extract<Annotation, { type: "stamp" }>;

function stamp(): ClientAnnotation {
  const base: Stamp = {
    type: "stamp",
    page: 0,
    rect: [100, 200, 200, 260],
    image_path: "A:\\signatures\\saved.png",
    scale: 1,
    rotation: 0,
    opacity: 1,
  };
  return { ...base, __clientId: "client-1" };
}

function fakeDrag(x: number, y: number): KonvaEventObject<DragEvent> {
  return { target: { x: () => x, y: () => y } } as unknown as KonvaEventObject<DragEvent>;
}

describe("PendingStampLayer corner resize handles (F6)", () => {
  it("commits one history entry per drag gesture, not per move", () => {
    for (const key of Object.keys(captured)) delete captured[key];
    const onRectChange = vi.fn();

    render(
      <PendingStampLayer
        page={0}
        pageWidth={612}
        pageHeight={792}
        viewport={makeViewport()}
        annotations={[stamp()]}
        selectedId="client-1"
        placement={null}
        onSelect={() => {}}
        onRectChange={onRectChange}
        onPlace={() => {}}
      />,
    );

    const handle = captured["resize-bottom-right"];
    expect(handle).toBeDefined();
    const onDragMove = handle.onDragMove as (e: KonvaEventObject<DragEvent>) => void;
    const onDragEnd = handle.onDragEnd as (e: KonvaEventObject<DragEvent>) => void;

    onDragMove(fakeDrag(205, 605));
    onDragMove(fakeDrag(215, 615));
    onDragMove(fakeDrag(225, 625));
    expect(onRectChange).not.toHaveBeenCalled();

    onDragEnd(fakeDrag(235, 635));
    expect(onRectChange).toHaveBeenCalledTimes(1);
    const [clientId, rect] = onRectChange.mock.calls[0] as [string, [number, number, number, number]];
    expect(clientId).toBe("client-1");
    expect(rect).toHaveLength(4);
  });
});
