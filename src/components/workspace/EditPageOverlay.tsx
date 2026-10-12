// Plan 050 task D2-UX: the one Konva `Stage` the Edit tool's page view
// needs. A field-fill click and a pending-annotation drag both need real
// pointer hit-testing, and two overlapping `Stage`s always block each
// other's clicks (a `Stage`'s container `<div>` covers the full page area
// and intercepts every pointer event over it, drawn shape or not) - so this
// composes the detected-fields layer and the pending-FreeText preview into
// one `OverlayCanvas` instead of stacking two.
import type { PageViewport } from "pdfjs-dist";
import type { DetectedFormField } from "@/bindings";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { DetectedFieldsGroup } from "./DetectedFieldsOverlay";
import type { ScreenRect } from "./detectedFieldGeometry";
import { OverlayCanvas } from "./OverlayCanvas";
import { PendingFreeTextLayer } from "./PendingFreeTextLayer";
import { PendingStampLayer } from "./PendingStampLayer";

interface Props {
  width: number;
  height: number;
  page: number;
  viewport: PageViewport;
  detectedFields: DetectedFormField[] | null;
  filledIds: Set<string>;
  onPickField: (field: DetectedFormField, screenRect: ScreenRect) => void;
  pendingAnnotations: ClientAnnotation[];
  selectedPendingId: string | null;
  onSelectPending: (clientId: string) => void;
  onPendingRectChange: (clientId: string, rect: [number, number, number, number]) => void;
  stampPlacement: { imagePath: string; aspectRatio: number } | null;
  pageWidth: number;
  pageHeight: number;
  onPlaceStamp: (rect: [number, number, number, number]) => void;
}

interface PreviewProps {
  width: number;
  height: number;
  page: number;
  viewport: PageViewport;
  pendingAnnotations: ClientAnnotation[];
  pageWidth: number;
  pageHeight: number;
}

const ignore = () => {};

/** Plan 119 p1: the pending values of this page, drawn but not editable,
 * for every tool and sub-tool that does not mount `EditPageOverlay`. The
 * stage takes no pointer events, so the tool's own overlay (crop, OCR
 * selection) still gets every click. */
export function PendingPreviewOverlay({
  width,
  height,
  page,
  viewport,
  pendingAnnotations,
  pageWidth,
  pageHeight,
}: PreviewProps) {
  return (
    <OverlayCanvas width={width} height={height} interactive={false}>
      <PendingStampLayer
        page={page}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        viewport={viewport}
        annotations={pendingAnnotations}
        selectedId={null}
        placement={null}
        onSelect={ignore}
        onRectChange={ignore}
        onPlace={ignore}
      />
      <PendingFreeTextLayer
        page={page}
        viewport={viewport}
        annotations={pendingAnnotations}
        selectedId={null}
        onSelect={ignore}
        onRectChange={ignore}
      />
    </OverlayCanvas>
  );
}

export function EditPageOverlay({
  width,
  height,
  page,
  viewport,
  detectedFields,
  filledIds,
  onPickField,
  pendingAnnotations,
  selectedPendingId,
  onSelectPending,
  onPendingRectChange,
  stampPlacement,
  pageWidth,
  pageHeight,
  onPlaceStamp,
}: Props) {
  return (
    <OverlayCanvas width={width} height={height}>
      <PendingStampLayer
        page={page}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        viewport={viewport}
        annotations={pendingAnnotations}
        selectedId={selectedPendingId}
        placement={stampPlacement}
        onSelect={onSelectPending}
        onRectChange={onPendingRectChange}
        onPlace={onPlaceStamp}
      />
      {detectedFields !== null && detectedFields.length > 0 && (
        <DetectedFieldsGroup
          fields={detectedFields}
          viewport={viewport}
          filledIds={filledIds}
          onPick={onPickField}
        />
      )}
      <PendingFreeTextLayer
        page={page}
        viewport={viewport}
        annotations={pendingAnnotations}
        selectedId={selectedPendingId}
        onSelect={onSelectPending}
        onRectChange={onPendingRectChange}
      />
    </OverlayCanvas>
  );
}
