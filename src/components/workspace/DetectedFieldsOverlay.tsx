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
//
// Plan 050 task D2-UX: this used to own its own `OverlayCanvas` (Konva
// `Stage`). It no longer does - a `Stage`'s container `<div>` covers the
// whole page area and captures every pointer event over it, drawn shape or
// not, so two of them stacked on the same page block each other's clicks.
// `EditPageOverlay` now owns the one `Stage` the Edit tool needs and
// composes this as a plain `<Group>` alongside the pending-annotation
// preview layer.
import type { PageViewport } from "pdfjs-dist";
import { Group, Rect } from "react-konva";
import type { DetectedFormField } from "@/bindings";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import { useCanvasColors } from "./useCanvasColors";

interface Props {
  fields: DetectedFormField[];
  viewport: PageViewport;
  filledIds: Set<string>;
  onPick: (field: DetectedFormField, screenRect: ScreenRect) => void;
}

export function DetectedFieldsGroup({ fields, viewport, filledIds, onPick }: Props) {
  const colors = useCanvasColors();
  return (
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
            fill={colors.soft}
            opacity={filled ? 0.5 : 1}
            stroke={colors.accent}
            strokeWidth={1}
            dash={field.kind === "underline" ? [4, 3] : undefined}
            onClick={() => onPick(field, screen)}
            onTap={() => onPick(field, screen)}
          />
        );
      })}
    </Group>
  );
}
