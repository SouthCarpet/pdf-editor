// Plan 062 T5.2: crop rectangle with eight handles on the shared Konva
// overlay. Workspace currently inlines a body-only Rect; swap that block
// for `<CropOverlay ... />` (see file header of the controller report).
import { useEffect, useRef } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect } from "react-konva";
import { withAlpha } from "@/lib/tokens";
import { useCanvasColors } from "./useCanvasColors";
import { OverlayCanvas } from "./OverlayCanvas";
import { commitCropDragEnd } from "./tools/cropHistory";
import {
  CROP_HANDLE_CURSOR,
  cropHandlePositions,
  moveCropRect,
  resizeCropRect,
  type CropHandle,
  type CropRect,
} from "./tools/cropModel";

const HANDLE_SIZE = 8;

interface Props {
  width: number;
  height: number;
  rect: CropRect;
  onRectChange: (rect: CropRect, recordHistory?: boolean) => void;
  docPath: string;
}

function setCursor(e: KonvaEventObject<MouseEvent>, cursor: string) {
  const container = e.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}

export function CropOverlay({ width, height, rect, onRectChange, docPath }: Props) {
  const applyRef = useRef<(next: CropRect) => void>((next) => onRectChange(next, false));
  const lastRectRef = useRef(rect);
  const bodyStartRef = useRef<CropRect>(rect);
  const handleStartRef = useRef<CropRect>(rect);
  const handleOriginRef = useRef({ x: 0, y: 0 });
  const page = { width, height };
  // Read live tokens each render (Konva cannot resolve CSS variables). Hex is jsdom fallback.
  const colors = useCanvasColors();
  const accent = colors.accent;
  const dimFill = withAlpha(colors.well, 0.4);

  useEffect(() => {
    applyRef.current = (next) => {
      lastRectRef.current = next;
      onRectChange(next, false);
    };
  }, [onRectChange]);

  useEffect(() => {
    lastRectRef.current = rect;
  }, [rect]);

  function onBodyDragStart() {
    bodyStartRef.current = rect;
  }

  function onBodyDragEnd(e: KonvaEventObject<DragEvent>) {
    const next = moveCropRect(rect, e.target.x() - rect.x, e.target.y() - rect.y, page);
    e.target.position({ x: next.x, y: next.y });
    commitCropDragEnd(docPath, bodyStartRef.current, next, applyRef.current);
  }

  function onHandleDragStart(originX: number, originY: number) {
    return () => {
      handleStartRef.current = rect;
      handleOriginRef.current = { x: originX, y: originY };
    };
  }

  function onHandleDragMove(handle: CropHandle) {
    return (e: KonvaEventObject<DragEvent>) => {
      const start = handleStartRef.current;
      const origin = handleOriginRef.current;
      const cx = e.target.x() + HANDLE_SIZE / 2;
      const cy = e.target.y() + HANDLE_SIZE / 2;
      const next = resizeCropRect(start, handle, cx - origin.x, cy - origin.y, page);
      applyRef.current(next);
    };
  }

  function onHandleDragEnd() {
    commitCropDragEnd(docPath, handleStartRef.current, lastRectRef.current, applyRef.current);
  }

  const handles = cropHandlePositions(rect);

  return (
    <OverlayCanvas width={width} height={height}>
      <Group>
        <Rect x={0} y={0} width={width} height={rect.y} fill={dimFill} listening={false} />
        <Rect
          x={0}
          y={rect.y + rect.height}
          width={width}
          height={Math.max(0, height - rect.y - rect.height)}
          fill={dimFill}
          listening={false}
        />
        <Rect
          x={0}
          y={rect.y}
          width={rect.x}
          height={rect.height}
          fill={dimFill}
          listening={false}
        />
        <Rect
          x={rect.x + rect.width}
          y={rect.y}
          width={Math.max(0, width - rect.x - rect.width)}
          height={rect.height}
          fill={dimFill}
          listening={false}
        />
        <Rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          stroke={accent}
          strokeWidth={1}
          fill="transparent"
          draggable
          onMouseEnter={(e) => setCursor(e, "move")}
          onMouseLeave={(e) => setCursor(e, "default")}
          onDragStart={onBodyDragStart}
          onDragEnd={onBodyDragEnd}
        />
        {handles.map(({ handle, x, y }) => (
          <Rect
            key={handle}
            x={x - HANDLE_SIZE / 2}
            y={y - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill={accent}
            stroke={accent}
            strokeWidth={1}
            draggable
            onMouseEnter={(e) => setCursor(e, CROP_HANDLE_CURSOR[handle])}
            onMouseLeave={(e) => setCursor(e, "default")}
            onDragStart={onHandleDragStart(x, y)}
            onDragMove={onHandleDragMove(handle)}
            onDragEnd={onHandleDragEnd}
          />
        ))}
      </Group>
    </OverlayCanvas>
  );
}
