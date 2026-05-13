// Renders a single PDF.js page onto a canvas. The parent owns the
// active page index + zoom so the workspace can swap pages without
// remounting the canvas component.
import { useEffect, useRef } from "react";
import type * as pdfjs from "pdfjs-dist";

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  pageIndex: number;
  zoom: number;
  className?: string;
}

export function PdfViewer({ pdf, pageIndex, zoom, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<pdfjs.PDFPageProxy["render"]> | null = null;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
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
  }, [pdf, pageIndex, zoom]);

  return <canvas ref={canvasRef} className={className} />;
}
