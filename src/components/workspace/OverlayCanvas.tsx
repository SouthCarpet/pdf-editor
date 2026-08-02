// Konva Stage layered above the PDF.js canvas. Tools (crop rect, form
// fields, annotations) render their interactive shapes as children
// inside this Layer. Stage is absolutely positioned to overlay the
// PDF.js raster - width/height match the current page viewport at the
// current zoom, so coordinates stay 1:1 with the underlying canvas.
import { Layer, Stage } from "react-konva";
import type { ReactNode } from "react";

interface Props {
  width: number;
  height: number;
  children?: ReactNode;
}

export function OverlayCanvas({ width, height, children }: Props) {
  return (
    <Stage
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
    >
      <Layer>{children}</Layer>
    </Stage>
  );
}
