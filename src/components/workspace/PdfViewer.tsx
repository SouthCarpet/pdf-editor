// Renders a single PDF.js page onto a canvas. The parent owns the
// active page index + zoom so the workspace can swap pages without
// remounting the canvas component.
import { useEffect, useRef } from "react";
import type * as pdfjs from "pdfjs-dist";
import { cn } from "@/lib/utils";
import { fitThumbnailSize } from "./thumbnailLayout";

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  pageIndex: number;
  zoom: number;
  /** When set, the page is contain-fitted into this box (T1.5) instead of
   * using `zoom`. The canvas CSS size never exceeds the box. */
  fitBox?: { width: number; height: number };
  className?: string;
}

export function PdfViewer({ pdf, pageIndex, zoom, fitBox, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fitWidth = fitBox?.width;
  const fitHeight = fitBox?.height;

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<pdfjs.PDFPageProxy["render"]> | null = null;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale =
        fitWidth !== undefined && fitHeight !== undefined
          ? fitThumbnailSize(base.width, base.height, fitWidth, fitHeight).scale
          : zoom;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      if (fitWidth !== undefined && fitHeight !== undefined) {
        canvas.style.width = "auto";
        canvas.style.height = "auto";
        canvas.style.maxWidth = `${fitWidth}px`;
        canvas.style.maxHeight = `${fitHeight}px`;
      } else {
        canvas.style.width = "";
        canvas.style.height = "";
        canvas.style.maxWidth = "";
        canvas.style.maxHeight = "";
      }
      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      await renderTask.promise;
    })().catch((err) => {
      // RenderingCancelledException is fine; the next effect already kicked
      // off a fresh render. Anything else is worth logging.
      if (err?.name !== "RenderingCancelledException") {
        console.error("PdfViewer render failed:", err);
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageIndex, zoom, fitWidth, fitHeight]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(fitBox && "max-h-full max-w-full object-contain", className)}
    />
  );
}
