// Top-level Workspace shell. Holds the tool picker, the virtualized
// thumbnail strip, the main PDF canvas (PDF.js), and a right-hand slot
// that hosts the active tool's panel. The PDF document itself is loaded
// by the route via `usePdfDocument`.
//
// Phase 11 Task 62: the right-hand slot now switches on
// `workspaceStore.activeTool`. The Crop tool ships in this commit;
// Organize/Extract panels are added in subsequent Phase 11 commits.
import type * as pdfjs from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Rect } from "react-konva";
import { commands, type DetectedFormField, type OcrSelectableWord } from "@/bindings";
import { NO_ANNOTATIONS, useAnnotations, type ClientAnnotation } from "@/stores/annotationsStore";
import { ZOOM_DEFAULT, useWorkspace } from "@/stores/workspaceStore";
import { DetectedFieldFill } from "./DetectedFieldFill";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import { EditPageOverlay } from "./EditPageOverlay";
import { EMPTY_FILLED_FIELDS, markFieldFilled, unmarkFieldForClientId } from "./filledFieldsState";
import { OcrSelectionOverlay } from "./OcrSelectionOverlay";
import { OverlayCanvas } from "./OverlayCanvas";
import { PendingAnnotationControls } from "./PendingAnnotationControls";
import { hexToRgb01, rgb01ToHex, type FreeTextAnnotation } from "./pendingAnnotationGeometry";
import { PdfViewer } from "./PdfViewer";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { CropPanel, type CropRect } from "./tools/CropPanel";
import { EditAnnotationsPanel } from "./tools/EditAnnotationsPanel";
import { EditFormsPanel } from "./tools/EditFormsPanel";
import { EditSubToolToggle } from "./tools/EditSubToolToggle";
import { EditTextPanel } from "./tools/EditTextPanel";
import { ExtractPanel } from "./tools/ExtractPanel";
import { OrganizePanel } from "./tools/OrganizePanel";
import { OcrEditPanel } from "./tools/OcrEditPanel";

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  /** Absolute filesystem path of the loaded PDF. Used by tool panels
   * that invoke backend commands. */
  path: string;
}

/** Captured on a Ctrl+wheel zoom so the scroll position can be corrected
 * once the page canvas actually resizes (see the two effects below). */
interface WheelAnchor {
  cursorClientX: number;
  cursorClientY: number;
  /** Cursor position in unscrolled content coordinates, at `prevZoom`. */
  contentX: number;
  contentY: number;
  prevZoom: number;
}

export function Workspace({ pdf, path }: Props) {
  const activeTool = useWorkspace((s) => s.activeTool);
  const editSubTool = useWorkspace((s) => s.editSubTool);
  const setEditSubTool = useWorkspace((s) => s.setEditSubTool);
  const activePage = useWorkspace((s) => s.activePage);
  const setActivePage = useWorkspace((s) => s.setActivePage);
  const zoom = useWorkspace((s) => s.zoomByDoc[path] ?? ZOOM_DEFAULT);
  const zoomIn = useWorkspace((s) => s.zoomIn);
  const zoomOut = useWorkspace((s) => s.zoomOut);
  const addAnnotation = useAnnotations((s) => s.add);
  const updateAnnotation = useAnnotations((s) => s.update);
  const removeAnnotation = useAnnotations((s) => s.remove);
  // R1: Ctrl+plus/minus/0, registered once for the whole workspace.
  useWorkspaceShortcuts(path);
  const mainRef = useRef<HTMLElement>(null);
  const wheelAnchorRef = useRef<WheelAnchor | null>(null);

  // Track the rendered viewport size of the active page so the overlay
  // (and crop rect) line up 1:1 with the PDF.js canvas.
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  // Plan 050 task D2: the viewport instance itself, not only its size. The
  // detected-fields overlay converts PDF points to screen pixels with its
  // `convertToViewportRectangle`, which already handles the Y flip, the
  // rotation and the MediaBox origin.
  const [pageViewport, setPageViewport] = useState<pdfjs.PageViewport | null>(null);

  // Crop rectangle lives at the workspace level so it can be shared
  // between the Konva overlay and the CropPanel.
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const ocrPageKey = `${path}\u0000${activePage}`;
  const [ocrPageState, setOcrPageState] = useState<{
    key: string;
    words: OcrSelectableWord[];
    notice: string | null;
  }>({ key: "", words: [], notice: null });
  const [ocrSelection, setOcrSelection] = useState<{ key: string; ids: Set<number> }>({
    key: "",
    ids: new Set(),
  });
  // Plan 050 task D2: detected blank fields for the page in view, and the
  // one the user clicked to type into. Keyed like the OCR words above so a
  // page or document switch does not show stale rectangles.
  const [detectState, setDetectState] = useState<{
    key: string;
    fields: DetectedFormField[] | null;
  }>({ key: "", fields: null });
  const [fillTarget, setFillTarget] = useState<{
    key: string;
    field: DetectedFormField;
    screenRect: ScreenRect;
  } | null>(null);
  const [filledState, setFilledState] = useState(EMPTY_FILLED_FIELDS);
  // Plan 050 task D2-UX: the pending FreeText annotation selected for
  // editing in the control strip (R2). Keyed like the state above so a
  // page or document switch does not leave a stale selection open.
  const [selectedPending, setSelectedPending] = useState<{ key: string; clientId: string } | null>(
    null,
  );
  // Plan 050 task D2-UX-2 (R7a): owned here, not inside the Forms panel,
  // because `Workspace` does not unmount when the Edit sub-tool changes -
  // a ref created inside `EditFormsPanel`/`DetectFieldsSection` dies with
  // them, so switching away from Forms and back reset the dedup and
  // re-ran auto-detection for a "Nájsť polia" request already handled.
  const autoDetectHandledRef = useRef(0);
  const detectedFields = detectState.key === ocrPageKey ? detectState.fields : null;
  const filledIds = filledState.key === ocrPageKey ? filledState.ids : EMPTY_FIELD_IDS;
  const ocrWords = ocrPageState.key === ocrPageKey ? ocrPageState.words : [];
  const ocrLayerNotice = ocrPageState.key === ocrPageKey ? ocrPageState.notice : null;
  const ocrWordsLoading = activeTool === "ocr" && ocrPageState.key !== ocrPageKey;
  const selectedOcrWordIds = ocrSelection.key === ocrPageKey ? ocrSelection.ids : new Set<number>();
  const pendingAnnotations = useAnnotations((s) => s.byDoc[path] ?? NO_ANNOTATIONS);
  const selectedPendingId = selectedPending?.key === ocrPageKey ? selectedPending.clientId : null;
  const selectedFreeText = pendingAnnotations.find(
    (a): a is ClientAnnotation & FreeTextAnnotation =>
      a.type === "free_text" && a.__clientId === selectedPendingId,
  );
  const hasPendingOnPage = pendingAnnotations.some(
    (a) => a.type === "free_text" && a.page === activePage,
  );

  // Clamp active page when the document changes (defensive).
  useEffect(() => {
    if (activePage >= pdf.numPages) setActivePage(0);
  }, [pdf, activePage, setActivePage]);

  // Resolve current page viewport size whenever the page or zoom changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(activePage + 1);
      if (cancelled) return;
      const vp = page.getViewport({ scale: zoom });
      setPageSize({ width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
      setPageViewport(vp);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, activePage, zoom]);

  // R1: Ctrl+wheel zooms around the cursor. The anchor is captured on the
  // wheel event and applied once `pageSize` actually reflects the new
  // zoom (React commits state before running effects, so this is exact -
  // no need to guess when the async `pdf.getPage` above settles).
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey || e.deltaY === 0 || !el) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      wheelAnchorRef.current = {
        cursorClientX: e.clientX,
        cursorClientY: e.clientY,
        contentX: e.clientX - rect.left + el.scrollLeft,
        contentY: e.clientY - rect.top + el.scrollTop,
        prevZoom: zoom,
      };
      if (e.deltaY < 0) zoomIn(path);
      else zoomOut(path);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [path, zoom, zoomIn, zoomOut]);

  useEffect(() => {
    const anchor = wheelAnchorRef.current;
    const el = mainRef.current;
    if (!anchor || !el) return;
    wheelAnchorRef.current = null;
    const ratio = zoom / anchor.prevZoom;
    const rect = el.getBoundingClientRect();
    el.scrollLeft = anchor.contentX * ratio - (anchor.cursorClientX - rect.left);
    el.scrollTop = anchor.contentY * ratio - (anchor.cursorClientY - rect.top);
    // Depends on `pageSize`, not `zoom`: the page canvas only actually
    // resizes once this state updates, and only then is a scroll
    // correction meaningful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  useEffect(() => {
    if (activeTool !== "ocr") return;
    let cancelled = false;
    void commands.listOcrPageWordsCmd(path, activePage).then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setOcrPageState({ key: ocrPageKey, words: [], notice: "error" });
      } else {
        setOcrPageState({
          key: ocrPageKey,
          words: result.data.words,
          notice: result.data.layer_identified ? null : result.data.notice,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTool, activePage, ocrPageKey, path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceTopBar path={path} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)]">
          <ThumbnailStrip
            pdf={pdf}
            active={activePage}
            onSelect={setActivePage}
            height={typeof window !== "undefined" ? window.innerHeight - 96 : 600}
          />
        </aside>
        <main
          ref={mainRef}
          className="flex flex-1 items-start justify-center overflow-auto bg-[var(--color-background)] p-6"
        >
          <div className="relative" style={{ width: pageSize.width, height: pageSize.height }}>
            <PdfViewer pdf={pdf} pageIndex={activePage} zoom={zoom} className="shadow-lg" />
            {activeTool === "crop" && pageSize.width > 0 && (
              <OverlayCanvas width={pageSize.width} height={pageSize.height}>
                <Rect
                  x={cropRect.x}
                  y={cropRect.y}
                  width={cropRect.width}
                  height={cropRect.height}
                  stroke="red"
                  strokeWidth={1}
                  dash={[4, 4]}
                  draggable
                  onDragEnd={(e) =>
                    setCropRect((r) => ({ ...r, x: e.target.x(), y: e.target.y() }))
                  }
                />
              </OverlayCanvas>
            )}
            {activeTool === "edit" &&
              (editSubTool === "forms" || editSubTool === "annotations") &&
              pageSize.width > 0 &&
              pageViewport !== null &&
              // Plan 050 task D2-UX: an empty Konva `Stage` has nothing to
              // show, so it stays unmounted rather than paying for one on
              // every Edit-tool page (this also keeps a document with no
              // pending annotations and no detected fields exactly as
              // canvas-free as it was before this task).
              ((editSubTool === "forms" && detectedFields !== null && detectedFields.length > 0) ||
                hasPendingOnPage) && (
                <EditPageOverlay
                  width={pageSize.width}
                  height={pageSize.height}
                  page={activePage}
                  viewport={pageViewport}
                  detectedFields={editSubTool === "forms" ? detectedFields : null}
                  filledIds={filledIds}
                  onPickField={(field, screenRect) =>
                    setFillTarget({ key: ocrPageKey, field, screenRect })
                  }
                  pendingAnnotations={pendingAnnotations}
                  selectedPendingId={selectedPendingId}
                  onSelectPending={(clientId) => setSelectedPending({ key: ocrPageKey, clientId })}
                  onPendingRectChange={(clientId, rect) =>
                    updateAnnotation(path, clientId, { rect })
                  }
                />
              )}
            {fillTarget !== null &&
              fillTarget.key === ocrPageKey &&
              activeTool === "edit" &&
              editSubTool === "forms" && (
                <DetectedFieldFill
                  field={fillTarget.field}
                  screenRect={fillTarget.screenRect}
                  onSubmit={(annotation) => {
                    const clientId = addAnnotation(path, annotation);
                    setFilledState((current) =>
                      markFieldFilled(current, ocrPageKey, fillTarget.field.id, clientId),
                    );
                    setFillTarget(null);
                    setSelectedPending({ key: ocrPageKey, clientId });
                  }}
                  onCancel={() => setFillTarget(null)}
                />
              )}
            {selectedFreeText &&
              pageViewport !== null &&
              activeTool === "edit" &&
              (editSubTool === "forms" || editSubTool === "annotations") && (
                <PendingAnnotationControls
                  screenRect={
                    toScreenRect(selectedFreeText.rect, pageViewport) ?? EMPTY_SCREEN_RECT
                  }
                  text={selectedFreeText.contents}
                  sizePt={selectedFreeText.style.size_pt ?? 12}
                  colorHex={rgb01ToHex(selectedFreeText.style.color)}
                  onChangeText={(text) =>
                    updateAnnotation(path, selectedFreeText.__clientId, { contents: text })
                  }
                  onChangeSize={(sizePt) =>
                    updateAnnotation(path, selectedFreeText.__clientId, {
                      style: { ...selectedFreeText.style, size_pt: sizePt },
                    })
                  }
                  onChangeColor={(hex) =>
                    updateAnnotation(path, selectedFreeText.__clientId, {
                      style: { ...selectedFreeText.style, color: hexToRgb01(hex) },
                    })
                  }
                  onConfirm={() => setSelectedPending(null)}
                  onDelete={() => {
                    removeAnnotation(path, selectedFreeText.__clientId);
                    // R7b (plan 050 D2-UX-2): a deleted fill no longer backs
                    // its detected field, so the field must stop showing as
                    // filled too.
                    setFilledState((current) =>
                      unmarkFieldForClientId(current, ocrPageKey, selectedFreeText.__clientId),
                    );
                    setSelectedPending(null);
                  }}
                />
              )}
            {activeTool === "ocr" && pageSize.width > 0 && ocrWords.length > 0 && (
              <OcrSelectionOverlay
                width={pageSize.width}
                height={pageSize.height}
                words={ocrWords}
                selectedIds={selectedOcrWordIds}
                onSelectionChange={(ids) => setOcrSelection({ key: ocrPageKey, ids })}
              />
            )}
          </div>
        </main>
        <aside className="w-72 shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-card)] p-3">
          {activeTool === "crop" && (
            <CropPanel
              docPath={path}
              pageWidth={pageSize.width}
              pageHeight={pageSize.height}
              rect={cropRect}
              onRectChange={setCropRect}
            />
          )}
          {activeTool === "organize" && <OrganizePanel pdf={pdf} docPath={path} />}
          {activeTool === "extract" && <ExtractPanel docPath={path} pageCount={pdf.numPages} />}
          {activeTool === "ocr" && (
            <OcrEditPanel
              docPath={path}
              pageIndex={activePage}
              words={ocrWords}
              selectedIds={selectedOcrWordIds}
              loading={ocrWordsLoading}
              layerNotice={ocrLayerNotice}
              onClearSelection={() => setOcrSelection({ key: ocrPageKey, ids: new Set() })}
            />
          )}
          {activeTool === "edit" && (
            <div className="space-y-3">
              <EditSubToolToggle value={editSubTool} onChange={setEditSubTool} />
              {editSubTool === "forms" && (
                <EditFormsPanel
                  docPath={path}
                  onSelectPage={setActivePage}
                  detectedFields={detectedFields}
                  onDetectedFields={(fields) => {
                    setDetectState({ key: ocrPageKey, fields });
                    setFillTarget(null);
                  }}
                  autoDetectHandledRef={autoDetectHandledRef}
                />
              )}
              {editSubTool === "annotations" && (
                <EditAnnotationsPanel
                  docPath={path}
                  pageWidth={pageSize.width}
                  pageHeight={pageSize.height}
                />
              )}
              {editSubTool === "text" && <EditTextPanel docPath={path} />}
            </div>
          )}
          {/* Compare uses a separate workspace shell (see WorkspaceRoute). */}
        </aside>
      </div>
    </div>
  );
}

const EMPTY_FIELD_IDS = new Set<string>();
// Fallback only: a selected pending annotation always has a rect, so
// `toScreenRect` only returns null for a malformed one from outside this app.
const EMPTY_SCREEN_RECT: ScreenRect = { x: 0, y: 0, width: 0, height: 0 };
