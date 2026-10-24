import { useEffect, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Vector2d } from "konva/lib/types";
import { Group, Rect, Text } from "react-konva";
import type { OwnFieldKind } from "@/bindings";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { readToken } from "@/lib/tokens";
import { clampToPage, defaultOwnFieldRect, drawnOwnFieldRect } from "./ownFieldGeometry";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import {
  resizeScreenEdge,
  toPdfRect,
  type OwnFieldAnnotation,
  type ResizeEdge,
} from "./pendingAnnotationGeometry";

type PdfRect = [number, number, number, number];
type PointerEvent = KonvaEventObject<MouseEvent | TouchEvent>;
interface Props {
  page: number;
  viewport: PageViewport;
  annotations: ClientAnnotation[];
  selectedId: string | null;
  placement?: OwnFieldKind | null;
  onSelect: (id: string) => void;
  onRectChange: (id: string, rect: PdfRect) => void;
  onPlace?: (rect: PdfRect) => void;
  interactive?: boolean;
}

function fieldColors() {
  return {
    accent: readToken("--color-accent", "#555"),
    soft: readToken("--color-accent-soft", "#eee"),
    text: readToken("--color-text", "#111"),
  };
}
type FieldColors = ReturnType<typeof fieldColors>;

function useFieldColors() {
  const [colors, setColors] = useState(fieldColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(fieldColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => observer.disconnect();
  }, []);
  return colors;
}

export function PendingOwnFieldLayer({
  page,
  viewport,
  annotations,
  selectedId,
  placement = null,
  onSelect,
  onRectChange,
  onPlace,
  interactive = true,
}: Props) {
  const colors = useFieldColors();
  const fields = annotations.filter(
    (item): item is ClientAnnotation & OwnFieldAnnotation =>
      item.type === "form_field" && item.page === page
  );
  return (
    <Group listening={interactive}>
      {fields.map((field) => (
        <OwnFieldBox
          key={field.__clientId}
          field={field}
          viewport={viewport}
          colors={colors}
          selected={interactive && field.__clientId === selectedId}
          onSelect={() => onSelect(field.__clientId)}
          onRectChange={(rect) => onRectChange(field.__clientId, rect)}
        />
      ))}
      {placement && (
        <FieldPlacement
          key={placement}
          kind={placement}
          viewport={viewport}
          onPlace={onPlace}
          colors={colors}
        />
      )}
    </Group>
  );
}

function pointer(event: PointerEvent): [number, number] | null {
  const position = event.target.getStage()?.getPointerPosition();
  return position ? [position.x, position.y] : null;
}

function square(rect: PdfRect, pageBox: readonly number[]): PdfRect {
  const side = Math.max(rect[2] - rect[0], rect[3] - rect[1], 12);
  return fittedSquare(rect, side, pageBox);
}

function squareFromEdge(rect: PdfRect, edge: ResizeEdge, pageBox: readonly number[]): PdfRect {
  const side = edge === "left" || edge === "right" ? rect[2] - rect[0] : rect[3] - rect[1];
  return fittedSquare(rect, side, pageBox);
}

function fittedSquare(rect: PdfRect, requestedSide: number, pageBox: readonly number[]): PdfRect {
  const side = Math.min(
    requestedSide,
    Math.abs(pageBox[2] - pageBox[0]),
    Math.abs(pageBox[3] - pageBox[1])
  );
  return [rect[0], rect[1], rect[0] + side, rect[1] + side];
}

function FieldPlacement({
  kind,
  viewport,
  onPlace,
  colors,
}: {
  kind: OwnFieldKind;
  viewport: PageViewport;
  onPlace?: (rect: PdfRect) => void;
  colors: FieldColors;
}) {
  const start = useRef<[number, number] | null>(null);
  const [preview, setPreview] = useState<ScreenRect | null>(null);
  function placementRect(from: [number, number], to: [number, number]): PdfRect {
    const point = viewport.convertToPdfPoint(...from) as [number, number];
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 3) {
      const rect = defaultOwnFieldRect(point, kind, viewport.viewBox);
      return kind === "checkbox"
        ? clampToPage(square(rect, viewport.viewBox), viewport.viewBox)
        : rect;
    }
    const rect = drawnOwnFieldRect(point, viewport.convertToPdfPoint(...to) as [number, number]);
    return clampToPage(
      kind === "checkbox" ? square(rect, viewport.viewBox) : rect,
      viewport.viewBox
    );
  }
  function move(event: PointerEvent) {
    const current = pointer(event);
    if (!current || !start.current) return;
    setPreview(toScreenRect(placementRect(start.current, current), viewport));
  }
  function finish(event: PointerEvent) {
    const current = pointer(event);
    if (!current || !start.current) return;
    const rect = placementRect(start.current, current);
    start.current = null;
    setPreview(null);
    onPlace?.(rect);
  }
  return (
    <Group>
      <Rect
        name="own-field-placement"
        width={viewport.width}
        height={viewport.height}
        fill="transparent"
        onMouseDown={(event) => {
          start.current = pointer(event);
        }}
        onTouchStart={(event) => {
          start.current = pointer(event);
        }}
        onMouseMove={move}
        onTouchMove={move}
        onMouseUp={finish}
        onTouchEnd={finish}
      />
      {preview && <Rect {...preview} stroke={colors.accent} fill={colors.soft} listening={false} />}
    </Group>
  );
}

function handles(screen: ScreenRect) {
  return [
    { edge: "left", x: screen.x, y: screen.y + screen.height / 2 },
    { edge: "right", x: screen.x + screen.width, y: screen.y + screen.height / 2 },
    { edge: "top", x: screen.x + screen.width / 2, y: screen.y },
    { edge: "bottom", x: screen.x + screen.width / 2, y: screen.y + screen.height },
  ] as const;
}

function OwnFieldBox({
  field,
  viewport,
  selected,
  onSelect,
  onRectChange,
  colors,
}: {
  field: ClientAnnotation & OwnFieldAnnotation;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onRectChange: (rect: PdfRect) => void;
  colors: FieldColors;
}) {
  const [preview, setPreview] = useState<ScreenRect | null>(null);
  const base = toScreenRect(field.rect, viewport);
  if (!base) return null;
  const screen = preview ?? base;
  const accent = colors.accent;
  function resize(edge: ResizeEdge, event: KonvaEventObject<DragEvent>): PdfRect {
    const coordinate = edge === "left" || edge === "right" ? event.target.x() : event.target.y();
    const resized = resizeScreenEdge(base!, edge, coordinate + 4.5, 12 * viewport.scale);
    const rect = toPdfRect(resized, viewport);
    return clampToPage(
      field.kind === "checkbox" ? squareFromEdge(rect, edge, viewport.viewBox) : rect,
      viewport.viewBox
    );
  }
  return (
    <Group>
      <Rect
        name={`own-field-${field.__clientId}`}
        {...screen}
        fill={colors.soft}
        stroke={accent}
        strokeWidth={selected ? 2 : 1}
        dash={selected ? undefined : [3, 3]}
        draggable={selected}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={onSelect}
        onDragEnd={(event) => {
          onRectChange(
            clampToPage(
              toPdfRect({ ...base, x: event.target.x(), y: event.target.y() }, viewport),
              viewport.viewBox
            )
          );
        }}
      />
      <Text
        x={screen.x + 3}
        y={screen.y + 3}
        width={Math.max(0, screen.width - 6)}
        height={Math.max(0, screen.height - 6)}
        text={field.name}
        fontSize={Math.min(12, screen.height - 4)}
        fill={colors.text}
        listening={false}
        wrap="none"
      />
      {selected &&
        handles(screen).map(({ edge, x, y }) => (
          <Rect
            key={edge}
            name={`own-resize-${edge}`}
            x={x - 4.5}
            y={y - 4.5}
            width={9}
            height={9}
            fill={accent}
            draggable
            dragBoundFunc={(position: Vector2d): Vector2d =>
              edge === "left" || edge === "right"
                ? { x: position.x, y: y - 4.5 }
                : { x: x - 4.5, y: position.y }
            }
            onDragMove={(event) => setPreview(toScreenRect(resize(edge, event), viewport))}
            onDragEnd={(event) => {
              const rect = resize(edge, event);
              setPreview(null);
              onRectChange(rect);
            }}
          />
        ))}
    </Group>
  );
}
