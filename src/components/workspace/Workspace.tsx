// Top-level Workspace shell. Holds the tool picker, the virtualized
// thumbnail strip, the main PDF canvas (PDF.js), and a right-hand slot
// that hosts the active tool's panel. The PDF document itself is loaded
// by the route via `usePdfDocument`.
//
// Phase 11 Task 62: the right-hand slot now switches on
// `workspaceStore.activeTool`. The Crop tool ships in this commit;
// Organize/Extract panels are added in subsequent Phase 11 commits.
import type * as pdfjs from "pdfjs-dist";
import { useEffect, useState } from "react";
import { Rect } from "react-konva";
import { commands, type OcrSelectableWord } from "@/bindings";
import { useWorkspace } from "@/stores/workspaceStore";
import { OcrSelectionOverlay } from "./OcrSelectionOverlay";
import { OverlayCanvas } from "./OverlayCanvas";
import { PdfViewer } from "./PdfViewer";
import { ThumbnailStrip } from "./ThumbnailStrip";
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

export function Workspace({ pdf, path }: Props) {
  const activeTool = useWorkspace((s) => s.activeTool);
  const editSubTool = useWorkspace((s) => s.editSubTool);
  const setEditSubTool = useWorkspace((s) => s.setEditSubTool);
  const activePage = useWorkspace((s) => s.activePage);
  const setActivePage = useWorkspace((s) => s.setActivePage);
  const zoom = useWorkspace((s) => s.zoom);

  // Track the rendered viewport size of the active page so the overlay
  // (and crop rect) line up 1:1 with the PDF.js canvas.
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

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
  const ocrWords = ocrPageState.key === ocrPageKey ? ocrPageState.words : [];
  const ocrLayerNotice = ocrPageState.key === ocrPageKey ? ocrPageState.notice : null;
  const ocrWordsLoading = activeTool === "ocr" && ocrPageState.key !== ocrPageKey;
  const selectedOcrWordIds = ocrSelection.key === ocrPageKey ? ocrSelection.ids : new Set<number>();

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
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, activePage, zoom]);

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
      <WorkspaceTopBar />
      <div className="flex flex-1 overflow-hidden">
        <aside className="shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)]">
          <ThumbnailStrip
            pdf={pdf}
            active={activePage}
            onSelect={setActivePage}
            height={typeof window !== "undefined" ? window.innerHeight - 96 : 600}
          />
        </aside>
        <main className="flex flex-1 items-start justify-center overflow-auto bg-[var(--color-background)] p-6">
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
                <EditFormsPanel docPath={path} onSelectPage={setActivePage} />
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
