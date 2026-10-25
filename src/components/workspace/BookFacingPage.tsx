// Plan 119 p1c: the page of a book-mode spread that is not the focused one.
// It is a click target that makes its page the focused one, and it shows the
// same pending values as the focused page, read-only. Only the focused page
// has the editable overlay.
import type * as pdfjs from "pdfjs-dist";
import type { PageViewport } from "pdfjs-dist";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { PendingPreviewOverlay } from "./EditPageOverlay";
import { PdfViewer } from "./PdfViewer";
import { pageHasPendingValue, type PendingFormValue } from "./pendingFormValues";

interface Size {
  width: number;
  height: number;
}

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  pageIndex: number;
  zoom: number;
  /** Rendered size at the current zoom, in pixels. */
  size: Size;
  /** Page size at scale 1, in PDF points. */
  baseSize: Size;
  /** Null until the page has been measured. */
  viewport: PageViewport | null;
  pendingAnnotations: ClientAnnotation[];
  formValues: PendingFormValue[];
  hiddenAnnotationIds: readonly string[];
  onSelect: () => void;
}

export function BookFacingPage({
  pdf,
  pageIndex,
  zoom,
  size,
  baseSize,
  viewport,
  pendingAnnotations,
  formValues,
  hiddenAnnotationIds,
  onSelect,
}: Props) {
  const overlayViewport =
    size.width > 0 && pageHasPendingValue(pendingAnnotations, formValues, pageIndex)
      ? viewport
      : null;

  return (
    <div
      className="relative shrink-0 cursor-pointer"
      style={{ width: size.width, height: size.height }}
      onClick={onSelect}
    >
      <PdfViewer
        pdf={pdf}
        pageIndex={pageIndex}
        zoom={zoom}
        className="block border border-[var(--color-border)] bg-[var(--color-surface-raised)]"
        hiddenAnnotationIds={hiddenAnnotationIds}
      />
      {overlayViewport !== null && (
        <PendingPreviewOverlay
          width={size.width}
          height={size.height}
          page={pageIndex}
          viewport={overlayViewport}
          // Workspace renders own fields in a separate facing-page layer.
          pendingAnnotations={pendingAnnotations.filter((annotation) => annotation.type !== "form_field")}
          formValues={formValues}
          pageWidth={baseSize.width}
          pageHeight={baseSize.height}
        />
      )}
    </div>
  );
}
