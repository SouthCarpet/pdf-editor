import { withAlpha } from "@/lib/tokens";
import { useCanvasColors } from "./useCanvasColors";
import { useState } from "react";
import { Group, Rect } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { OcrSelectableWord } from "@/bindings";
import { OverlayCanvas } from "./OverlayCanvas";

interface Props {
  width: number;
  height: number;
  words: OcrSelectableWord[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
}

interface DragRect {
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function OcrSelectionOverlay({
  width,
  height,
  words,
  selectedIds,
  onSelectionChange,
}: Props) {
  const colors = useCanvasColors();
  const [drag, setDrag] = useState<DragRect | null>(null);

  function startDrag(event: KonvaEventObject<MouseEvent>) {
    if (event.target.name() !== "ocr-selection-background") return;
    const point = event.target.getStage()?.getPointerPosition();
    if (!point) return;
    setDrag({
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });
  }

  function updateDrag(event: KonvaEventObject<MouseEvent>) {
    if (!drag) return;
    const point = event.target.getStage()?.getPointerPosition();
    if (!point) return;
    setDrag({
      ...drag,
      x: Math.min(drag.startX, point.x),
      y: Math.min(drag.startY, point.y),
      width: Math.abs(point.x - drag.startX),
      height: Math.abs(point.y - drag.startY),
    });
  }

  function finishDrag() {
    if (!drag) return;
    if (drag.width >= 3 || drag.height >= 3) {
      const next = new Set(selectedIds);
      for (const word of words) {
        if (wordIntersects(word, drag, width, height)) next.add(word.id);
      }
      onSelectionChange(next);
    } else {
      onSelectionChange(new Set());
    }
    setDrag(null);
  }

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  return (
    <OverlayCanvas width={width} height={height}>
      <Group onMouseDown={startDrag} onMouseMove={updateDrag} onMouseUp={finishDrag}>
        <Rect
          name="ocr-selection-background"
          x={0}
          y={0}
          width={width}
          height={height}
          fill={withAlpha(colors.accent, 0.001)}
          listening
        />
        {words.map((word) => {
          const [x0, y0, x1, y1] = word.bbox;
          if (x0 === null || y0 === null || x1 === null || y1 === null) return null;
          const selected = selectedIds.has(word.id);
          return (
            <Rect
              key={word.id}
              x={x0 * width}
              y={y0 * height}
              width={(x1 - x0) * width}
              height={(y1 - y0) * height}
              fill={colors.soft}
              opacity={selected ? 1 : 0.5}
              stroke={colors.accent}
              strokeWidth={selected ? 1.5 : 0.75}
              onClick={() => toggle(word.id)}
              onTap={() => toggle(word.id)}
            />
          );
        })}
        {drag && (
          <Rect
            x={drag.x}
            y={drag.y}
            width={drag.width}
            height={drag.height}
            fill={colors.soft}
            stroke={colors.accent}
            dash={[4, 3]}
            listening={false}
          />
        )}
      </Group>
    </OverlayCanvas>
  );
}


function wordIntersects(word: OcrSelectableWord, drag: DragRect, width: number, height: number): boolean {
  const [x0, y0, x1, y1] = word.bbox;
  if (x0 === null || y0 === null || x1 === null || y1 === null) return false;
  return x0 * width <= drag.x + drag.width && x1 * width >= drag.x &&
    y0 * height <= drag.y + drag.height && y1 * height >= drag.y;
}
