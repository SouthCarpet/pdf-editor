// Plan 050 task D2: draws the empty boxes and lines detected on a scanned
// page, and reports the one the user clicks so the workspace can open an
// input over it.
//
// Shape follows `OcrSelectionOverlay`, with one difference that matters:
// a detected field's `rect` is a true PDF /Rect in points, not the
// normalized 0-1 top-left box the OCR overlay consumes, so it cannot use
// the same multiply-by-width scaling. The conversion goes through the
// PDF.js viewport that already rendered the page, which handles the Y
// flip, the page rotation and the MediaBox origin in one place.
import type { PageViewport } from "pdfjs-dist";
import { Group, Rect } from "react-konva";
import type { DetectedFormField } from "@/bindings";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import { OverlayCanvas } from "./OverlayCanvas";

interface Props {
  width: number;
  height: number;
  fields: DetectedFormField[];
  viewport: PageViewport;
  filledIds: Set<string>;
  onPick: (field: DetectedFormField, screenRect: ScreenRect) => void;
}

export function DetectedFieldsOverlay({
  width,
  height,
  fields,
  viewport,
  filledIds,
  onPick,
}: Props) {
  return (
    <OverlayCanvas width={width} height={height}>
      <Group>
        {fields.map((field) => {
          const screen = toScreenRect(field.rect, viewport);
          if (screen === null) return null;
          const filled = filledIds.has(field.id);
          return (
            <Rect
              key={field.id}
              x={screen.x}
              y={screen.y}
              width={screen.width}
              height={screen.height}
              fill={filled ? "rgba(22, 163, 74, 0.16)" : "rgba(37, 99, 235, 0.08)"}
              stroke={filled ? "#16a34a" : "#2563eb"}
              strokeWidth={1}
              dash={field.kind === "underline" ? [4, 3] : undefined}
              onClick={() => onPick(field, screen)}
              onTap={() => onPick(field, screen)}
            />
          );
        })}
      </Group>
    </OverlayCanvas>
  );
}
