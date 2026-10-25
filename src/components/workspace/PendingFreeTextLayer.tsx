import { useCanvasColors, canvasOutline } from "./useCanvasColors";
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
import { useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Vector2d } from "konva/lib/types";
import { Group, Rect, Text } from "react-konva";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import {
  MIN_RESIZE_SIZE_PT,
  clampRectToPage,
  freeTextRenderProps,
  keepRectOnPage,
  resizeScreenEdge,
  toPdfRect,
  type FreeTextAnnotation,
  type ResizeEdge,
} from "./pendingAnnotationGeometry";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import { standardFontPreviewFamily } from "./standardTextStyle";
import { textBlockOffset } from "./textBlockPlacement";

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
    (a): a is PendingFreeText => a.type === "free_text" && a.page === page
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
  // Resize handles preview locally while dragging and commit once on
  // release (plan 062 final fix wave F6). `onRectChange` pushes one undo
  // entry per call, like `updateAnnotation`, so a per-move commit burned
  // one history entry per pixel of drag instead of one per gesture - the
  // same fix the crop overlay already applies to its own drag. Declared
  // before the early return below so hook order stays stable.
  const [previewScreen, setPreviewScreen] = useState<ScreenRect | null>(null);
  const colors = useCanvasColors();
  const rendered = freeTextRenderProps(item, viewport);
  if (rendered === null) return null;
  const { screen: baseScreen, fontSizePx, colorCss, backgroundCss } = rendered;
  const screen = previewScreen ?? baseScreen;
  const horizontalInsetPx = 2 * viewport.scale;
  const { verticalOffsetPx, lineHeight, fontStyle, textDecoration } = previewTypography(item, screen, fontSizePx);

  function onDragEnd(e: KonvaEventObject<DragEvent>) {
    const next: ScreenRect = {
      x: e.target.x(),
      y: e.target.y(),
      width: screen.width,
      height: screen.height,
    };
    onRectChange(keepRectOnPage(toPdfRect(next, viewport), viewport.viewBox));
  }

  // R2 (plan 050 D2-UX-3b): resize from any of the four edges, not only
  // the bottom-right corner - a wide detected field can now be narrowed.
  // Plan 119 p1c: the handle moves one SCREEN side, the result is converted
  // back to a PDF rect (so a page turned by 90 degrees moves the right PDF
  // edge) and cut at the page box, like a whole-box drag. The font size is
  // never touched here (R2): only `rect` is patched.
  function edgeResizeRect(
    edge: ResizeEdge,
    axis: "x" | "y",
    e: KonvaEventObject<DragEvent>,
  ): [number, number, number, number] {
    const screenValue = (axis === "x" ? e.target.x() : e.target.y()) + HANDLE_SIZE / 2;
    const resized = resizeScreenEdge(
      screen,
      edge,
      screenValue,
      MIN_RESIZE_SIZE_PT * viewport.scale,
    );
    return clampRectToPage(toPdfRect(resized, viewport), viewport.viewBox);
  }

  function onEdgeDragMove(edge: ResizeEdge, axis: "x" | "y") {
    return (e: KonvaEventObject<DragEvent>) => {
      const next = toScreenRect(edgeResizeRect(edge, axis, e), viewport);
      if (next !== null) setPreviewScreen(next);
    };
  }

  function onEdgeDragEnd(edge: ResizeEdge, axis: "x" | "y") {
    return (e: KonvaEventObject<DragEvent>) => {
      const next = edgeResizeRect(edge, axis, e);
      setPreviewScreen(null);
      onRectChange(next);
    };
  }

  return (
    <Group>
      <Rect
        name="pending-value"
        x={screen.x}
        y={screen.y}
        width={screen.width}
        height={screen.height}
        fill={backgroundCss ?? undefined}
        {...canvasOutline(selected, colors.accent)}
        draggable={selected}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={onDragEnd}
      />
      {/* Plan 119 p1b: a value longer than its cell is clipped to the cell,
          like the saved appearance stream (its /BBox is the cell). */}
      <Group
        name="pending-value-clip"
        clipX={screen.x}
        clipY={screen.y}
        clipWidth={screen.width}
        clipHeight={screen.height}
        listening={false}
      >
        <Text
          x={screen.x + horizontalInsetPx}
          y={screen.y + verticalOffsetPx}
          width={Math.max(screen.width - 2 * horizontalInsetPx, 1)}
          text={item.contents}
          fontSize={fontSizePx}
          fontFamily={standardFontPreviewFamily(item.style.font_family)}
          fontStyle={fontStyle}
          textDecoration={textDecoration}
          lineHeight={lineHeight}
          fill={colorCss}
          align={item.style.align}
          wrap="none"
          listening={false}
        />
      </Group>
      {selected &&
        edgeHandles(screen).map(({ edge, x, y, axis }) => (
          <Rect
            key={edge}
            name={`resize-${edge}`}
            x={x - HANDLE_SIZE / 2}
            y={y - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill={colors.accent}
            draggable
            dragBoundFunc={(pos: Vector2d): Vector2d =>
              axis === "x"
                ? { x: pos.x, y: y - HANDLE_SIZE / 2 }
                : { x: x - HANDLE_SIZE / 2, y: pos.y }
            }
            onDragMove={onEdgeDragMove(edge, axis)}
            onDragEnd={onEdgeDragEnd(edge, axis)}
          />
        ))}
    </Group>
  );
}


function previewTypography(item: PendingFreeText, screen: ScreenRect, fontSizePx: number) {
  const lines = item.contents.split(/\r?\n/);
  const lineHeight = item.style.line_height_multiplier ?? 1.2;
  const verticalOffsetPx = textBlockOffset(
    [0, 0, screen.width, screen.height],
    lines,
    fontSizePx,
    lineHeight,
    item.style.vertical_align ?? "top"
  );
  const fontStyle = [item.style.bold ? "bold" : "", item.style.italic ? "italic" : ""]
    .filter(Boolean)
    .join(" ");
  const textDecoration = [
    item.style.underline ? "underline" : "",
    item.style.strikethrough ? "line-through" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { verticalOffsetPx, lineHeight, fontStyle: fontStyle || "normal", textDecoration: textDecoration || undefined };
}
