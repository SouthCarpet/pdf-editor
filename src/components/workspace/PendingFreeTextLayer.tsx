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
import { Group, Rect, Text } from "react-konva";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { freeTextRenderProps, toPdfRect, type FreeTextAnnotation } from "./pendingAnnotationGeometry";
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
const MIN_HANDLE_DRAG_PX = 12;

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

  function onHandleDragMove(e: KonvaEventObject<DragEvent>) {
    const width = Math.max(MIN_HANDLE_DRAG_PX, e.target.x() - screen.x);
    const height = Math.max(MIN_HANDLE_DRAG_PX, e.target.y() - screen.y);
    onRectChange(toPdfRect({ x: screen.x, y: screen.y, width, height }, viewport));
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
      {selected && (
        <Rect
          x={screen.x + screen.width - HANDLE_SIZE / 2}
          y={screen.y + screen.height - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill="#111827"
          draggable
          onDragMove={onHandleDragMove}
        />
      )}
    </Group>
  );
}
