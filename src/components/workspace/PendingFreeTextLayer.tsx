// Plan 050 task D2-UX (R1): the live preview for every accumulated (not
// yet saved) FreeText annotation on the current page - at its rectangle,
// with the font size and colour that will be written to the PDF, through
// the same `PageViewport` conversion `DetectedFieldsGroup` uses.
//
// Shared by both the Forms fill flow and the Annotations panel: both write
// into the same `useAnnotations` store, so one layer previews both instead
// of forking two implementations.
//
// A plain `<Group>`, not its own `Stage`: see the comment in
// `DetectedFieldsOverlay.tsx` for why two overlapping Konva stages block
// each other's clicks. `EditPageOverlay` mounts the one `Stage`.
import type { PageViewport } from "pdfjs-dist";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Vector2d } from "konva/lib/types";
import { Group, Rect, Text } from "react-konva";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import {
  freeTextRenderProps,
  resizeRectEdge,
  toPdfRect,
  type FreeTextAnnotation,
  type ResizeEdge,
} from "./pendingAnnotationGeometry";
import type { ScreenRect } from "./detectedFieldGeometry";

type PendingFreeText = ClientAnnotation & FreeTextAnnotation;

interface Props {
  page: number;
  viewport: PageViewport;
  annotations: ClientAnnotation[];
  selectedId: string | null;
  onSelect: (clientId: string) => void;
  onRectChange: (clientId: string, rect: [number, number, number, number]) => void;
}

const HANDLE_SIZE = 9;

/** One draggable handle at the midpoint of one rectangle edge, and the
 * screen axis it moves along - the other axis is pinned so the drag can
 * only narrow/widen (left/right) or shorten/heighten (top/bottom) one
 * dimension at a time. */
interface EdgeHandle {
  edge: ResizeEdge;
  x: number;
  y: number;
  axis: "x" | "y";
}

function edgeHandles(screen: ScreenRect): EdgeHandle[] {
  const midX = screen.x + screen.width / 2;
  const midY = screen.y + screen.height / 2;
  return [
    { edge: "left", x: screen.x, y: midY, axis: "x" },
    { edge: "right", x: screen.x + screen.width, y: midY, axis: "x" },
    { edge: "top", x: midX, y: screen.y, axis: "y" },
    { edge: "bottom", x: midX, y: screen.y + screen.height, axis: "y" },
  ];
}

export function PendingFreeTextLayer({
  page,
  viewport,
  annotations,
  selectedId,
  onSelect,
  onRectChange,
}: Props) {
  const items = annotations.filter(
    (a): a is PendingFreeText => a.type === "free_text" && a.page === page,
  );

  return (
    <Group>
      {items.map((item) => (
        <PendingFreeTextItem
          key={item.__clientId}
          item={item}
          viewport={viewport}
          selected={item.__clientId === selectedId}
          onSelect={() => onSelect(item.__clientId)}
          onRectChange={(rect) => onRectChange(item.__clientId, rect)}
        />
      ))}
    </Group>
  );
}

function PendingFreeTextItem({
  item,
  viewport,
  selected,
  onSelect,
  onRectChange,
}: {
  item: PendingFreeText;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onRectChange: (rect: [number, number, number, number]) => void;
}) {
  const rendered = freeTextRenderProps(item, viewport);
  if (rendered === null) return null;
  const { screen, fontSizePx, colorCss, backgroundCss } = rendered;

  function onDragEnd(e: KonvaEventObject<DragEvent>) {
    const next: ScreenRect = {
      x: e.target.x(),
      y: e.target.y(),
      width: screen.width,
      height: screen.height,
    };
    onRectChange(toPdfRect(next, viewport));
  }

  // R2 (plan 050 D2-UX-3b): resize from any of the four edges, not only
  // the bottom-right corner - a wide detected field can now be narrowed.
  // `screen` (already validated non-null above) recovers the current PDF
  // rect through `toPdfRect`, so the resize maths never has to special-
  // case the wire annotation's nullable `rect` tuple. The font size is
  // never touched here (R2): only `rect` is patched.
  function onEdgeDragMove(edge: ResizeEdge, axis: "x" | "y") {
    return (e: KonvaEventObject<DragEvent>) => {
      const currentRect = toPdfRect(screen, viewport);
      const screenValue = (axis === "x" ? e.target.x() : e.target.y()) + HANDLE_SIZE / 2;
      const point =
        axis === "x"
          ? viewport.convertToPdfPoint(screenValue, screen.y)
          : viewport.convertToPdfPoint(screen.x, screenValue);
      const valuePt = axis === "x" ? point[0] : point[1];
      onRectChange(resizeRectEdge(currentRect, edge, valuePt));
    };
  }

  return (
    <Group>
      <Rect
        x={screen.x}
        y={screen.y}
        width={screen.width}
        height={screen.height}
        fill={backgroundCss ?? undefined}
        stroke={selected ? "#111827" : "rgba(17, 24, 39, 0.35)"}
        strokeWidth={selected ? 1.5 : 1}
        dash={selected ? undefined : [3, 3]}
        draggable={selected}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={onDragEnd}
      />
      <Text
        x={screen.x + 2}
        y={screen.y + 1}
        width={Math.max(screen.width - 4, 1)}
        text={item.contents}
        fontSize={fontSizePx}
        fill={colorCss}
        align={item.style.align}
        listening={false}
      />
      {selected &&
        edgeHandles(screen).map(({ edge, x, y, axis }) => (
          <Rect
            key={edge}
            x={x - HANDLE_SIZE / 2}
            y={y - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="#111827"
            draggable
            dragBoundFunc={(pos: Vector2d): Vector2d =>
              axis === "x"
                ? { x: pos.x, y: y - HANDLE_SIZE / 2 }
                : { x: x - HANDLE_SIZE / 2, y: pos.y }
            }
            onDragMove={onEdgeDragMove(edge, axis)}
          />
        ))}
    </Group>
  );
}
