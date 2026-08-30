// Top-level Workspace shell. Holds the tool picker, the virtualized
// thumbnail strip, the main PDF canvas (PDF.js), and a right-hand slot
// that hosts the active tool's panel. The PDF document itself is loaded
// by the route via `usePdfDocument`.
//
// Phase 11 Task 62: the right-hand slot now switches on
// `workspaceStore.activeTool`. The Crop tool ships in this commit;
// Organize/Extract panels are added in subsequent Phase 11 commits.
import type * as pdfjs from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rect } from "react-konva";
import { commands, type DetectedFormField, type OcrSelectableWord } from "@/bindings";
import { NO_ANNOTATIONS, useAnnotations, type ClientAnnotation } from "@/stores/annotationsStore";
import { linkAnnotationToFilledField } from "@/stores/annotationHistory";
import { historyStore } from "@/stores/historyStore";
import { ZOOM_DEFAULT, useWorkspace, zoomForMode } from "@/stores/workspaceStore";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import { EditPageOverlay } from "./EditPageOverlay";
import { deletePendingAnnotation } from "./deletePending";
import { selectAdjacentField, selectDetectedField } from "./fieldNavigation";
import type { FieldDirection } from "./fieldOrder";
import {
  EMPTY_FILLED_FIELDS,
  markFieldFilled,
  unmarkFieldForClientId,
} from "./filledFieldsState";
import { OcrSelectionOverlay } from "./OcrSelectionOverlay";
import { OverlayCanvas } from "./OverlayCanvas";
import { PendingAnnotationControls } from "./PendingAnnotationControls";
import { hexToRgb01, rgb01ToHex, type FreeTextAnnotation } from "./pendingAnnotationGeometry";
import { PdfViewer } from "./PdfViewer";
import { SearchHighlightLayer } from "./SearchHighlightLayer";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { buildPageIndex, findMatches, type PageTextIndex } from "./textSearch";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";
import { WorkspaceSearchBar } from "./WorkspaceSearchBar";
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

interface CachedTextIndex {
  path: string;
  pdf: pdfjs.PDFDocumentProxy;
  pages: PageTextIndex[];
  complete: boolean;
}

const EMPTY_TEXT_INDEX: PageTextIndex[] = [];

export function Workspace({ pdf, path }: Props) {
  const activeTool = useWorkspace((s) => s.activeTool);
  const editSubTool = useWorkspace((s) => s.editSubTool);
  const setEditSubTool = useWorkspace((s) => s.setEditSubTool);
  const activePage = useWorkspace((s) => s.activePage);
  const setActivePage = useWorkspace((s) => s.setActivePage);
  const zoom = useWorkspace((s) => s.zoomByDoc[path] ?? ZOOM_DEFAULT);
  const zoomIn = useWorkspace((s) => s.zoomIn);
  const zoomOut = useWorkspace((s) => s.zoomOut);
  const zoomMode = useWorkspace((s) => s.zoomModeByDoc[path] ?? "custom");
  const applyZoomForMode = useWorkspace((s) => s.applyZoomForMode);
  const thumbnailStripCollapsed = useWorkspace((s) => s.thumbnailStripCollapsed);
  const setThumbnailStripCollapsed = useWorkspace((s) => s.setThumbnailStripCollapsed);
  const addAnnotation = useAnnotations((s) => s.add);
  const updateAnnotation = useAnnotations((s) => s.update);
  const removeAnnotation = useAnnotations((s) => s.remove);
  const mainRef = useRef<HTMLElement>(null);
  const pendingAnnotationHostRef = useRef<HTMLDivElement>(null);
  const wheelAnchorRef = useRef<WheelAnchor | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchQueryRef = useRef("");

  // Track the rendered viewport size of the active page so the overlay
  // (and crop rect) line up 1:1 with the PDF.js canvas.
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [basePageSize, setBasePageSize] = useState({ width: 0, height: 0 });
  const [viewerBoxSize, setViewerBoxSize] = useState({ width: 0, height: 0 });
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
  const [filledState, setFilledState] = useState(EMPTY_FILLED_FIELDS);
  // Plan 050 task D2-UX: the pending FreeText annotation selected for
  // editing in the control strip (R2). Keyed like the state above so a
  // page or document switch does not leave a stale selection open.
  const [selectedPending, setSelectedPending] = useState<{ key: string; clientId: string } | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndexRequested, setSearchIndexRequested] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [textIndexState, setTextIndexState] = useState<CachedTextIndex | null>(null);
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
  const cachedTextIndex =
    textIndexState?.path === path && textIndexState.pdf === pdf ? textIndexState : null;
  const indexedPages =
    cachedTextIndex?.pdf === pdf ? cachedTextIndex.pages : EMPTY_TEXT_INDEX;
  const searchMatches = useMemo(
    () => findMatches(indexedPages, searchQuery),
    [indexedPages, searchQuery],
  );
  const currentSearchMatchIndex =
    searchMatches.length === 0 ? 0 : Math.min(searchMatchIndex, searchMatches.length - 1);
  const currentSearchMatch = searchMatches[currentSearchMatchIndex];
  const currentPageMatches = searchMatches.filter((match) => match.page === activePage);
  const searchIndexing = cachedTextIndex?.pdf !== pdf || !cachedTextIndex.complete;

  const handleDeletePending = useCallback(() => {
    if (!selectedFreeText) return;
    const clientId = selectedFreeText.__clientId;
    const filled = deletePendingAnnotation({
      remove: removeAnnotation,
      filled: filledState,
      docPath: path,
      pageKey: ocrPageKey,
      clientId,
    });
    setFilledState(filled);
    setSelectedPending(null);
  }, [selectedFreeText, removeAnnotation, filledState, path, ocrPageKey]);

  const applyFieldSelection = useCallback(
    (selection: ReturnType<typeof selectDetectedField>) => {
      linkAnnotationToFilledField(path, selection.clientId, {
        mark: () =>
          setFilledState((current) =>
            markFieldFilled(
              current,
              ocrPageKey,
              selection.field.id,
              selection.clientId,
            ),
          ),
        unmark: () =>
          setFilledState((current) =>
            unmarkFieldForClientId(current, ocrPageKey, selection.clientId),
          ),
      });
      setFilledState(selection.filled);
      setSelectedPending({ key: ocrPageKey, clientId: selection.clientId });
    },
    [ocrPageKey, path],
  );

  const changeCropRect = useCallback(
    (next: CropRect, recordHistory = true) => {
      if (
        next.x === cropRect.x &&
        next.y === cropRect.y &&
        next.width === cropRect.width &&
        next.height === cropRect.height
      ) {
        return;
      }
      const before = cropRect;
      setCropRect(next);
      if (!recordHistory) return;
      historyStore.getState().push(path, {
        label: "crop",
        undo: () => setCropRect(before),
        redo: () => setCropRect(next),
      });
    },
    [cropRect, path],
  );

  const handleSelectField = useCallback(
    (field: DetectedFormField) => {
      applyFieldSelection(
        selectDetectedField({
          field,
          filled: filledState,
          pageKey: ocrPageKey,
          docPath: path,
          addAnnotation,
        }),
      );
    },
    [addAnnotation, applyFieldSelection, filledState, ocrPageKey, path],
  );

  const moveFieldSelection = useCallback(
    (direction: FieldDirection) => {
      if (detectedFields === null) return;
      const currentFieldId =
        selectedPendingId === null
          ? undefined
          : filledState.fieldIdByClientId[selectedPendingId];
      if (currentFieldId === undefined) return;
      const selection = selectAdjacentField({
        fields: detectedFields,
        currentId: currentFieldId,
        direction,
        filled: filledState,
        pageKey: ocrPageKey,
        docPath: path,
        addAnnotation,
      });
      if (selection !== null) applyFieldSelection(selection);
    },
    [
      addAnnotation,
      applyFieldSelection,
      detectedFields,
      filledState,
      ocrPageKey,
      path,
      selectedPendingId,
    ],
  );

  const handleNextField = useCallback(() => moveFieldSelection("next"), [moveFieldSelection]);
  const handlePreviousField = useCallback(
    () => moveFieldSelection("previous"),
    [moveFieldSelection],
  );
  const handleConfirm = useCallback(() => setSelectedPending(null), []);
  const handleConfirmNextField = useCallback(() => {
    handleConfirm();
    handleNextField();
  }, [handleConfirm, handleNextField]);

  const selectPage = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(0, index), Math.max(0, pdf.numPages - 1));
      setActivePage(clamped);
      mainRef.current?.scrollTo({ top: 0, left: 0 });
    },
    [pdf.numPages, setActivePage],
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchIndexRequested(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const moveSearchMatch = useCallback(
    (direction: 1 | -1) => {
      if (searchMatches.length === 0) return;
      const next =
        (currentSearchMatchIndex + direction + searchMatches.length) % searchMatches.length;
      setSearchMatchIndex(next);
      selectPage(searchMatches[next].page);
    },
    [currentSearchMatchIndex, searchMatches, selectPage],
  );
  const nextSearchMatch = useCallback(() => moveSearchMatch(1), [moveSearchMatch]);
  const previousSearchMatch = useCallback(() => moveSearchMatch(-1), [moveSearchMatch]);
  const previousPage = useCallback(() => selectPage(activePage - 1), [activePage, selectPage]);
  const nextPage = useCallback(() => selectPage(activePage + 1), [activePage, selectPage]);
  const firstPage = useCallback(() => selectPage(0), [selectPage]);
  const lastPage = useCallback(() => selectPage(pdf.numPages - 1), [pdf.numPages, selectPage]);

  const changeSearchQuery = useCallback(
    (query: string) => {
      searchQueryRef.current = query;
      setSearchQuery(query);
      setSearchMatchIndex(0);
      const firstMatch = findMatches(indexedPages, query)[0];
      if (firstMatch) selectPage(firstMatch.page);
    },
    [indexedPages, selectPage],
  );

  useWorkspaceShortcuts(path, {
    onDeletePending: handleDeletePending,
    onNextField: handleNextField,
    onPreviousField: handlePreviousField,
    onConfirmNextField: handleConfirmNextField,
    onPreviousPage: previousPage,
    onNextPage: nextPage,
    onFirstPage: firstPage,
    onLastPage: lastPage,
    onOpenSearch: openSearch,
    searchOpen,
    onCloseSearch: closeSearch,
    onNextSearchMatch: nextSearchMatch,
    onPreviousSearchMatch: previousSearchMatch,
  });

  useEffect(() => {
    if (selectedPending === null) return;
    const input = pendingAnnotationHostRef.current?.querySelector<HTMLInputElement>(
      '[role="group"] input[type="text"]',
    );
    input?.focus();
    input?.select();
  }, [selectedPending]);

  // Clamp active page when the document changes (defensive).
  useEffect(() => {
    if (activePage >= pdf.numPages) setActivePage(0);
  }, [pdf, activePage, setActivePage]);

  // The search index starts only after search is opened, then grows one
  // page at a time. Cleanup cancels outstanding PDF.js work on document
  // change (and pauses it while the search UI is closed).
  useEffect(() => {
    if (!searchIndexRequested) return;
    let cancelled = false;
    const pages: PageTextIndex[] = [];

    void (async () => {
      for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex + 1);
        if (cancelled) return;
        const textContent = await page.getTextContent();
        if (cancelled) return;
        const hadMatches = findMatches(pages, searchQueryRef.current).length > 0;
        pages.push(buildPageIndex(textContent));
        setTextIndexState({ path, pdf, pages: [...pages], complete: false });
        if (!hadMatches) {
          const firstMatch = findMatches(pages, searchQueryRef.current)[0];
          if (firstMatch) {
            setSearchMatchIndex(0);
            selectPage(firstMatch.page);
          }
        }
      }
      setTextIndexState({ path, pdf, pages: [...pages], complete: true });
    })().catch((error: unknown) => {
      if (!cancelled) console.error("PDF text search indexing failed:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [path, pdf, searchIndexRequested, selectPage]);

  // Measure the padded viewer content box. ResizeObserver covers panel
  // changes; the explicit window listener guarantees resize recomputation.
  useEffect(() => {
    const viewer = mainRef.current;
    if (!viewer) return;
    const viewerElement = viewer;
    function measure() {
      const style = getComputedStyle(viewerElement);
      const width =
        viewerElement.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height =
        viewerElement.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setViewerBoxSize({ width: Math.max(0, width), height: Math.max(0, height) });
    }
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewerElement);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const derivedZoom = zoomForMode(zoomMode, basePageSize, viewerBoxSize);
    if (derivedZoom !== null && derivedZoom !== zoom) applyZoomForMode(path, derivedZoom);
  }, [applyZoomForMode, basePageSize, path, viewerBoxSize, zoom, zoomMode]);

  // Resolve current page viewport size whenever the page or zoom changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(activePage + 1);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: zoom });
      setBasePageSize({ width: base.width, height: base.height });
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
      <WorkspaceTopBar
        path={path}
        pageCount={pdf.numPages}
        activePage={activePage}
        onSelectPage={selectPage}
        onOpenSearch={openSearch}
      />
      {searchOpen && (
        <WorkspaceSearchBar
          ref={searchInputRef}
          query={searchQuery}
          position={searchMatches.length === 0 ? 0 : currentSearchMatchIndex + 1}
          total={searchMatches.length}
          indexing={searchIndexing}
          onQueryChange={changeSearchQuery}
          onPrevious={previousSearchMatch}
          onNext={nextSearchMatch}
          onClose={closeSearch}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        <aside className="shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)]">
          <ThumbnailStrip
            pdf={pdf}
            active={activePage}
            onSelect={selectPage}
            height={
              typeof window !== "undefined" ? window.innerHeight - (searchOpen ? 144 : 96) : 600
            }
            collapsed={thumbnailStripCollapsed}
            onToggleCollapsed={() => setThumbnailStripCollapsed(!thumbnailStripCollapsed)}
          />
        </aside>
        <main
          ref={mainRef}
          className="flex flex-1 items-start justify-center overflow-auto bg-[var(--color-background)] p-6"
        >
          <div
            ref={pendingAnnotationHostRef}
            data-pending-annotation-host
            className="relative"
            style={{ width: pageSize.width, height: pageSize.height }}
          >
            <PdfViewer pdf={pdf} pageIndex={activePage} zoom={zoom} className="shadow-lg" />
            {searchOpen &&
              pageSize.width > 0 &&
              pageViewport !== null &&
              currentPageMatches.length > 0 && (
                <SearchHighlightLayer
                  width={pageSize.width}
                  height={pageSize.height}
                  viewport={pageViewport}
                  matches={currentPageMatches}
                  currentMatch={
                    currentSearchMatch?.page === activePage ? currentSearchMatch : undefined
                  }
                />
              )}
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
                    changeCropRect({ ...cropRect, x: e.target.x(), y: e.target.y() })
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
                  onPickField={handleSelectField}
                  pendingAnnotations={pendingAnnotations}
                  selectedPendingId={selectedPendingId}
                  onSelectPending={(clientId) => setSelectedPending({ key: ocrPageKey, clientId })}
                  onPendingRectChange={(clientId, rect) =>
                    updateAnnotation(path, clientId, { rect })
                  }
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
                  styleEditing={{
                    style: selectedFreeText.style,
                    onChange: (style) =>
                      updateAnnotation(path, selectedFreeText.__clientId, { style }),
                  }}
                  onConfirm={handleConfirm}
                  onDelete={handleDeletePending}
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
              onRectChange={changeCropRect}
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
