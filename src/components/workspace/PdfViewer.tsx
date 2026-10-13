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
  /** Plan 119 p1b: pdf.js ids (`"12R"`) of saved annotations not to draw,
   * because a pending edit replaces them. */
  hiddenAnnotationIds?: readonly string[];
}

// pdf.js `AnnotationMode.ENABLE_STORAGE`. A value import of pdfjs-dist here
// would load pdf.js in every test that mounts this component.
const ANNOTATION_MODE_ENABLE_STORAGE = 3;

export function PdfViewer({
  pdf,
  pageIndex,
  zoom,
  fitBox,
  className,
  hiddenAnnotationIds = NO_IDS,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fitWidth = fitBox?.width;
  const fitHeight = fitBox?.height;
  const hiddenKey = hiddenAnnotationIds.join(",");

  // pdf.js skips an annotation whose storage entry says `noView` when the
  // page renders with ENABLE_STORAGE. The ids are cleared again on change.
  useEffect(() => {
    const ids = hiddenKey === "" ? [] : hiddenKey.split(",");
    for (const id of ids) holdHidden(pdf, id);
    return () => {
      for (const id of ids) releaseHidden(pdf, id);
    };
  }, [pdf, hiddenKey]);

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
      renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        annotationMode: ANNOTATION_MODE_ENABLE_STORAGE,
      });
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
  }, [pdf, pageIndex, zoom, fitWidth, fitHeight, hiddenKey]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(fitBox && "max-h-full max-w-full object-contain", className)}
    />
  );
}

const NO_IDS: readonly string[] = [];

// Plan 119 p1c: book mode mounts two viewers on one document, and both hide
// the value being edited. The storage entry is per document, so it is held
// once per viewer and removed when the last viewer lets go.
const hiddenHolds = new WeakMap<pdfjs.PDFDocumentProxy, Map<string, number>>();

function holdHidden(pdf: pdfjs.PDFDocumentProxy, id: string): void {
  const holds = hiddenHolds.get(pdf) ?? new Map<string, number>();
  hiddenHolds.set(pdf, holds);
  holds.set(id, (holds.get(id) ?? 0) + 1);
  pdf.annotationStorage.setValue(id, { noView: true });
}

function releaseHidden(pdf: pdfjs.PDFDocumentProxy, id: string): void {
  const holds = hiddenHolds.get(pdf);
  const remaining = (holds?.get(id) ?? 1) - 1;
  if (remaining > 0) {
    holds?.set(id, remaining);
    return;
  }
  holds?.delete(id);
  pdf.annotationStorage.remove(id);
}
