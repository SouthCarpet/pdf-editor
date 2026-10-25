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
import {
  commands,
  type DetectedFormField,
  type OcrSelectableWord,
  type SignatureRecord,
  type OwnFieldKind,
} from "@/bindings";
import { NO_ANNOTATIONS, useAnnotations, type ClientAnnotation } from "@/stores/annotationsStore";
import { linkAnnotationToFilledField } from "@/stores/annotationHistory";
import { NO_FORM_DRAFT, useFormDrafts } from "@/stores/formDraftStore";
import { useFilledFields, type FilledFieldsUpdater } from "@/stores/filledFieldsStore";
import { ZOOM_DEFAULT, useWorkspace, zoomForMode } from "@/stores/workspaceStore";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import { BookFacingPage } from "./BookFacingPage";
import { EditPageOverlay, PendingPreviewOverlay } from "./EditPageOverlay";
import { pageHasPendingValue, pendingFormValues } from "./pendingFormValues";
import { pageOverlayMode } from "./pageOverlayMode";
import {
  fieldsWithSavedValues,
  pdfjsAnnotationId,
  savedFreeTexts,
  type SavedFreeText,
} from "./savedFieldValues";
import { deletePendingAnnotation } from "./deletePending";
import { selectAdjacentField, selectDetectedField } from "./fieldNavigation";
import type { FieldDirection } from "./fieldOrder";
import { EMPTY_FILLED_FIELDS, markFieldFilled, unmarkFieldForClientId } from "./filledFieldsState";
import { OcrSelectionOverlay } from "./OcrSelectionOverlay";
import { CropOverlay } from "./CropOverlay";
import { PendingAnnotationControls } from "./PendingAnnotationControls";
import { hexToRgb01, rgb01ToHex, type FreeTextAnnotation } from "./pendingAnnotationGeometry";
import { PdfViewer } from "./PdfViewer";
import { pagePairs, spreadFor, spreadIndexOf, type PagePair } from "./pagePairs";
import { SearchHighlightLayer } from "./SearchHighlightLayer";
import { ShortcutOverlay } from "./ShortcutOverlay";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { carryThumbnail } from "./thumbnailCarry";
import "./workspace.css";
import { buildPageIndex, findMatches, type PageTextIndex } from "./textSearch";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";
import { WorkspaceSearchBar } from "./WorkspaceSearchBar";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { CropPanel, type CropRect } from "./tools/CropPanel";
import { cropRectsEqual, scaleCropRect } from "./tools/cropModel";
import { EditAnnotationsPanel } from "./tools/EditAnnotationsPanel";
import { EditFormsPanel } from "./tools/EditFormsPanel";
import { EditSubToolToggle } from "./tools/EditSubToolToggle";
import { EditTextPanel } from "./tools/EditTextPanel";
import { SignaturePanel } from "./tools/SignaturePanel";
import { ExtractPanel } from "./tools/ExtractPanel";
import { OrganizePanel } from "./tools/OrganizePanel";
import { OcrEditPanel } from "./tools/OcrEditPanel";
import { buildStampAnnotation, fitStampIntoDetectedBox } from "./signaturePlacement";
import { suggestFieldName } from "./ownFieldGeometry";

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
const BOOK_GAP = 8;

interface PageMeasurement {
  pageIndex: number;
  base: { width: number; height: number };
  rendered: { width: number; height: number };
  viewport: pdfjs.PageViewport;
}

interface SpreadMeasurement {
  pdf: pdfjs.PDFDocumentProxy;
  key: string;
  baseSize: { width: number; height: number };
  renderedSize: { width: number; height: number };
  pageSizes: Record<number, { width: number; height: number }>;
  /** Plan 119 p1c: what the facing page of a spread needs to draw its overlay. */
  baseSizes: Record<number, { width: number; height: number }>;
  viewports: Record<number, pdfjs.PageViewport>;
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
  const zoomMode = useWorkspace((s) => s.zoomModeByDoc[path] ?? "custom");
  const applyZoomForMode = useWorkspace((s) => s.applyZoomForMode);
  const storedBookMode = useWorkspace((s) => s.bookModeByDoc[path] ?? false);
  const setBookMode = useWorkspace((s) => s.setBookMode);
  const bookMode = pdf.numPages > 1 && storedBookMode;
  const thumbnailStripCollapsed = useWorkspace((s) => s.thumbnailStripCollapsed);
  const setThumbnailStripCollapsed = useWorkspace((s) => s.setThumbnailStripCollapsed);
  const addAnnotation = useAnnotations((s) => s.add);
  const updateAnnotation = useAnnotations((s) => s.update);
  const removeAnnotation = useAnnotations((s) => s.remove);
  const mainRef = useRef<HTMLElement>(null);
  const cancelCarry = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelCarry.current?.(), []);
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
  const [spreadMeasurement, setSpreadMeasurement] = useState<SpreadMeasurement | null>(null);
  // Plan 050 task D2: the viewport instance itself, not only its size. The
  // detected-fields overlay converts PDF points to screen pixels with its
  // `convertToViewportRectangle`, which already handles the Y flip, the
  // rotation and the MediaBox origin.
  const [pageViewport, setPageViewport] = useState<pdfjs.PageViewport | null>(null);

  // Crop rectangle lives at the workspace level so it can be shared
  // between the Konva overlay and the CropPanel. Stored in PDF points
  // (page-base scale, like `basePageSize`/stamps), not on-screen pixels,
  // so Apply sends real points to `crop_pdf_cmd` at any zoom (plan 062
  // final fix wave F1). `CropOverlay` renders and drags in screen pixels,
  // so it gets a `scaleCropRect(cropRect, zoom)` view and reports back
  // through the inverse scale.
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
  const filledState = useFilledFields((s) => s.byDoc[path] ?? EMPTY_FILLED_FIELDS);
  const setFilledState = useCallback(
    (next: FilledFieldsUpdater) => {
      useFilledFields.getState().setFilled(path, next);
    },
    [path]
  );
  // Plan 050 task D2-UX: the pending FreeText annotation selected for
  // editing in the control strip (R2). Keyed like the state above so a
  // page or document switch does not leave a stale selection open.
  const [selectedPending, setSelectedPending] = useState<{ key: string; clientId: string } | null>(
    null
  );
  const [stampPlacement, setStampPlacement] = useState<SignatureRecord | null>(null);
  const [fieldPlacement, setFieldPlacement] = useState<OwnFieldKind | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
  // Plan 119 p1: FreeText values already saved in the page on screen (the
  // saved copy after a save, or a reopened filled file). Detected cells
  // under them show as filled although no pending annotation backs them.
  const [savedValues, setSavedValues] = useState<{
    pdf: pdfjs.PDFDocumentProxy | null;
    page: number;
    values: SavedFreeText[];
  }>({ pdf: null, page: -1, values: [] });
  const {
    detectedFields,
    pageSavedValues,
    shownFilledIds,
    ocrWords,
    ocrLayerNotice,
    ocrWordsLoading,
    selectedOcrWordIds,
    pendingAnnotations,
    selectedPendingId,
    selectedPendingAnnotation,
    selectedFreeText,
    replacedAnnotationIds,
    formValues,
    hasPendingOnPage,
  } = usePageFields({
    detectState,
    filledState,
    savedValues,
    pdf,
    activePage,
    ocrPageKey,
    ocrPageState,
    ocrSelection,
    activeTool,
    path,
    selectedPending,
  });

  const overlayMode = pageOverlayMode({
    activeTool,
    editSubTool,
    hasDetectedFields: detectedFields !== null && detectedFields.length > 0,
    hasPendingOnPage,
    placingStamp: stampPlacement !== null || fieldPlacement !== null,
  });
  const {
    indexedPages,
    searchMatches,
    currentSearchMatchIndex,
    currentSearchMatch,
    currentPageMatches,
    searchIndexing,
  } = useSearchResults(textIndexState, path, pdf, searchQuery, searchMatchIndex, activePage);

  const {
    activeSpread,
    spreadKey,
    pairBaseSize,
    pairRenderedSize,
    visiblePageSizes,
    visibleBaseSizes,
    visibleViewports,
  } = useSpreadState(activePage, pdf, bookMode, spreadMeasurement);

  const handleDeletePending = useCallback(() => {
    if (!selectedPendingAnnotation) return;
    if (
      selectedPendingAnnotation.type === "form_field" &&
      (activeTool !== "edit" || editSubTool !== "forms")
    )
      return;
    const clientId = selectedPendingAnnotation.__clientId;
    const filled = deletePendingAnnotation({
      remove: removeAnnotation,
      filled: filledState,
      docPath: path,
      pageKey: ocrPageKey,
      clientId,
    });
    setFilledState(filled);
    setSelectedPending(null);
  }, [
    activeTool,
    editSubTool,
    selectedPendingAnnotation,
    removeAnnotation,
    filledState,
    path,
    ocrPageKey,
    setFilledState,
  ]);

  const placeStamp = useCallback(
    (rect: [number, number, number, number]) => {
      if (stampPlacement === null) return;
      const clientId = addAnnotation(
        path,
        buildStampAnnotation(activePage, rect, stampPlacement.file_path)
      );
      setSelectedPending({ key: ocrPageKey, clientId });
      setStampPlacement(null);
    },
    [activePage, addAnnotation, ocrPageKey, path, stampPlacement]
  );

  const placeField = useCallback(
    (rect: [number, number, number, number]) => {
      if (fieldPlacement === null) return;
      const names = pendingAnnotations.flatMap((item) =>
        item.type === "form_field" ? [item.name] : []
      );
      const clientId = addAnnotation(path, {
        type: "form_field",
        page: activePage,
        rect,
        name: suggestFieldName(names),
        kind: fieldPlacement,
        multiline: false,
        font_size: 12,
      });
      setSelectedPending({ key: ocrPageKey, clientId });
      setFieldPlacement(null);
    },
    [activePage, addAnnotation, fieldPlacement, ocrPageKey, path, pendingAnnotations]
  );

  const selectOwnField = useCallback(
    (clientId: string) => {
      const field = useAnnotations.getState().byDoc[path]?.find((item) => item.__clientId === clientId);
      if (field?.type !== "form_field") return;
      setActivePage(field.page);
      setSelectedPending({ key: `${path}\u0000${field.page}`, clientId });
    },
    [path, setActivePage]
  );

  const applyFieldSelection = useCallback(
    (selection: ReturnType<typeof selectDetectedField>) => {
      linkAnnotationToFilledField(path, selection.clientId, {
        mark: () =>
          setFilledState((current) =>
            markFieldFilled(current, ocrPageKey, selection.field.id, selection.clientId)
          ),
        unmark: () =>
          setFilledState((current) =>
            unmarkFieldForClientId(current, ocrPageKey, selection.clientId)
          ),
      });
      setFilledState(selection.filled);
      setSelectedPending({ key: ocrPageKey, clientId: selection.clientId });
    },
    [ocrPageKey, path, setFilledState]
  );

  // History for crop edits is recorded once, by `cropHistory.ts` (plan 062
  // final fix wave F2). This only ever applies the rect; it never pushes
  // its own history entry, so there is one writer, not two.
  const changeCropRect = useCallback((next: CropRect) => {
    setCropRect((current) => (cropRectsEqual(current, next) ? current : next));
  }, []);

  const handleSelectField = useCallback(
    (field: DetectedFormField) => {
      applyFieldSelection(
        selectDetectedField({
          field,
          filled: filledState,
          pageKey: ocrPageKey,
          docPath: path,
          addAnnotation,
          saved: pageSavedValues,
        })
      );
    },
    [addAnnotation, applyFieldSelection, filledState, ocrPageKey, pageSavedValues, path]
  );

  const handlePickField = useCallback(
    (field: DetectedFormField) => {
      if (editSubTool === "signature" && stampPlacement !== null) {
        const rect = fitStampIntoDetectedBox(
          field,
          stampPlacement.width / Math.max(stampPlacement.height, 1)
        );
        if (rect !== null) placeStamp(rect);
        return;
      }
      if (editSubTool === "forms") handleSelectField(field);
    },
    [editSubTool, handleSelectField, placeStamp, stampPlacement]
  );

  const moveFieldSelection = useCallback(
    (direction: FieldDirection) => {
      if (detectedFields === null) return;
      const currentFieldId =
        selectedPendingId === null ? undefined : filledState.fieldIdByClientId[selectedPendingId];
      if (currentFieldId === undefined) return;
      const selection = selectAdjacentField({
        fields: detectedFields,
        currentId: currentFieldId,
        direction,
        filled: filledState,
        pageKey: ocrPageKey,
        docPath: path,
        addAnnotation,
        saved: pageSavedValues,
      });
      if (selection !== null) applyFieldSelection(selection);
    },
    [
      addAnnotation,
      applyFieldSelection,
      detectedFields,
      filledState,
      ocrPageKey,
      pageSavedValues,
      path,
      selectedPendingId,
    ]
  );

  const handleNextField = useCallback(() => moveFieldSelection("next"), [moveFieldSelection]);
  const handlePreviousField = useCallback(
    () => moveFieldSelection("previous"),
    [moveFieldSelection]
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
    [pdf.numPages, setActivePage]
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
  const openShortcuts = useCallback(() => {
    setSearchOpen(false);
    setShortcutsOpen(true);
  }, []);

  const moveSearchMatch = useCallback(
    (direction: 1 | -1) => {
      if (searchMatches.length === 0) return;
      const next =
        (currentSearchMatchIndex + direction + searchMatches.length) % searchMatches.length;
      setSearchMatchIndex(next);
      selectPage(searchMatches[next].page);
    },
    [currentSearchMatchIndex, searchMatches, selectPage]
  );
  const nextSearchMatch = useCallback(() => moveSearchMatch(1), [moveSearchMatch]);
  const previousSearchMatch = useCallback(() => moveSearchMatch(-1), [moveSearchMatch]);
  const previousPage = useCallback(() => selectPage(activePage - 1), [activePage, selectPage]);
  const nextPage = useCallback(() => selectPage(activePage + 1), [activePage, selectPage]);
  const moveSpread = useCallback(
    (direction: -1 | 1) => {
      const spreads = pagePairs(pdf.numPages);
      const current = spreadIndexOf(activePage, pdf.numPages);
      if (current < 0) return;
      const target = Math.min(Math.max(0, current + direction), spreads.length - 1);
      const [left, right] = spreads[target];
      selectPage(left ?? right ?? 0);
    },
    [activePage, pdf.numPages, selectPage]
  );
  const previousSpread = useCallback(() => moveSpread(-1), [moveSpread]);
  const nextSpread = useCallback(() => moveSpread(1), [moveSpread]);
  const toggleBookMode = useCallback(() => {
    if (pdf.numPages <= 1) return;
    setBookMode(path, !bookMode);
  }, [bookMode, path, pdf.numPages, setBookMode]);
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
    [indexedPages, selectPage]
  );

  useWorkspaceShortcuts(path, {
    onDeletePending: handleDeletePending,
    onNextField: handleNextField,
    onPreviousField: handlePreviousField,
    onConfirmNextField: handleConfirmNextField,
    onPreviousPage: previousPage,
    onNextPage: nextPage,
    onPreviousSpread: previousSpread,
    onNextSpread: nextSpread,
    onToggleBookMode: toggleBookMode,
    onFirstPage: firstPage,
    onLastPage: lastPage,
    onOpenSearch: openSearch,
    onOpenShortcuts: openShortcuts,
    searchOpen,
    onCloseSearch: closeSearch,
    onNextSearchMatch: nextSearchMatch,
    onPreviousSearchMatch: previousSearchMatch,
  });

  useEffect(() => {
    if (selectedPending === null) return;
    const input = pendingAnnotationHostRef.current?.querySelector<HTMLInputElement>(
      '[role="group"] input[type="text"]'
    );
    input?.focus();
    input?.select();
  }, [selectedPending]);

  useEffect(() => {
    let cancelled = false;
    void pdf
      .getPage(activePage + 1)
      .then((page) => page.getAnnotations())
      .then((annotations) => {
        if (cancelled) return;
        setSavedValues({ pdf, page: activePage, values: savedFreeTexts(annotations) });
      })
      .catch(() => {
        if (!cancelled) setSavedValues({ pdf, page: activePage, values: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [activePage, pdf]);

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
    const fitSize = bookMode ? pairBaseSize : basePageSize;
    const derivedZoom = zoomForMode(zoomMode, fitSize, viewerBoxSize, bookMode ? BOOK_GAP : 0);
    if (derivedZoom !== null && derivedZoom !== zoom) applyZoomForMode(path, derivedZoom);
  }, [applyZoomForMode, basePageSize, bookMode, pairBaseSize, path, viewerBoxSize, zoom, zoomMode]);

  // Measure every painted page at the shared zoom. The active page keeps
  // the viewport used by the single editable overlay; the pair sizes drive
  // fit modes and the wheel-anchor correction.
  useEffect(() => {
    let cancelled = false;
    const visiblePages = bookMode
      ? activeSpread.filter((pageIndex): pageIndex is number => pageIndex !== null)
      : [activePage];

    void Promise.all(
      visiblePages.map(async (pageIndex): Promise<PageMeasurement> => {
        const page = await pdf.getPage(pageIndex + 1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: zoom });
        return {
          pageIndex,
          base: { width: base.width, height: base.height },
          rendered: { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) },
          viewport,
        };
      })
    ).then((measurements) => {
      if (cancelled) return;
      const active = measurements.find((measurement) => measurement.pageIndex === activePage);
      if (!active) return;
      setBasePageSize(active.base);
      setPageSize(active.rendered);
      setPageViewport(active.viewport);

      const byPage = new Map(
        measurements.map((measurement) => [measurement.pageIndex, measurement])
      );
      const left = measuredSpreadPage(byPage, activeSpread, activePage, active);
      const right = measuredSpreadPage(
        byPage,
        [activeSpread[1], activeSpread[0]],
        activePage,
        active
      );
      const pageSizes = Object.fromEntries(
        measurements.map((measurement) => [measurement.pageIndex, measurement.rendered])
      );
      const baseSizes = Object.fromEntries(
        measurements.map((measurement) => [measurement.pageIndex, measurement.base])
      );
      const viewports = Object.fromEntries(
        measurements.map((measurement) => [measurement.pageIndex, measurement.viewport])
      );
      setSpreadMeasurement({
        pdf,
        key: spreadKey,
        baseSizes,
        viewports,
        baseSize: bookMode
          ? {
            width: left.base.width + right.base.width,
            height: Math.max(left.base.height, right.base.height),
          }
          : active.base,
        renderedSize: bookMode
          ? {
            width: left.rendered.width + BOOK_GAP + right.rendered.width,
            height: Math.max(left.rendered.height, right.rendered.height),
          }
          : active.rendered,
        pageSizes,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, activeSpread, bookMode, pdf, spreadKey, zoom]);

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
  }, [bookMode, pageSize, pairRenderedSize]);

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

  const focusedPageSurface = renderFocusedPage();

  function renderSearchHighlights() {
    return (
      <>
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
      </>
    );
  }

  function renderPendingPreview() {
    return (
      <>
        {overlayMode === "preview" && pageSize.width > 0 && pageViewport !== null && (
          <PendingPreviewOverlay
            width={pageSize.width}
            height={pageSize.height}
            page={activePage}
            viewport={pageViewport}
            pendingAnnotations={pendingAnnotations}
            formValues={formValues}
            pageWidth={basePageSize.width}
            pageHeight={basePageSize.height}
          />
        )}
      </>
    );
  }

  function renderPendingEditor() {
    return (
      <>
        {overlayMode === "edit" && pageSize.width > 0 && pageViewport !== null && (
          <EditPageOverlay
            width={pageSize.width}
            height={pageSize.height}
            page={activePage}
            viewport={pageViewport}
            detectedFields={
              editSubTool === "forms" || editSubTool === "signature" ? detectedFields : null
            }
            filledIds={shownFilledIds}
            onPickField={handlePickField}
            pendingAnnotations={pendingAnnotations}
            formValues={formValues}
            selectedPendingId={selectedPendingId}
            onSelectPending={(clientId) => setSelectedPending({ key: ocrPageKey, clientId })}
            onPendingRectChange={(clientId, rect) => updateAnnotation(path, clientId, { rect })}
            stampPlacement={
              stampPlacement === null
                ? null
                : {
                  imagePath: stampPlacement.file_path,
                  aspectRatio: stampPlacement.width / Math.max(stampPlacement.height, 1),
                }
            }
            pageWidth={basePageSize.width}
            pageHeight={basePageSize.height}
            onPlaceStamp={placeStamp}
            fieldPlacement={fieldPlacement}
            ownFieldsEditable={editSubTool === "forms"}
            onPlaceField={placeField}
          />
        )}
      </>
    );
  }

  function renderPendingControls() {
    return (
      <>
        {selectedFreeText &&
          pageViewport !== null &&
          activeTool === "edit" &&
          (editSubTool === "forms" || editSubTool === "annotations") && (
            <PendingAnnotationControls
              screenRect={toScreenRect(selectedFreeText.rect, pageViewport) ?? EMPTY_SCREEN_RECT}
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
                onChange: (style) => updateAnnotation(path, selectedFreeText.__clientId, { style }),
              }}
              onConfirm={handleConfirm}
              onDelete={handleDeletePending}
            />
          )}
      </>
    );
  }

  function renderOcrSelection() {
    return (
      <>
        {activeTool === "ocr" && pageSize.width > 0 && ocrWords.length > 0 && (
          <OcrSelectionOverlay
            width={pageSize.width}
            height={pageSize.height}
            words={ocrWords}
            selectedIds={selectedOcrWordIds}
            onSelectionChange={(ids) => setOcrSelection({ key: ocrPageKey, ids })}
          />
        )}
      </>
    );
  }

  function renderEditPanel() {
    return (
      <>
        {activeTool === "edit" && (
          <div className="space-y-3">
            <EditSubToolToggle value={editSubTool} onChange={setEditSubTool} />
            {editSubTool === "forms" && (
              <EditFormsPanel
                key={ocrPageKey}
                docPath={path}
                fieldPlacement={fieldPlacement}
                onFieldPlacementChange={setFieldPlacement}
                selectedOwnFieldId={selectedPendingId}
                onSelectOwnField={selectOwnField}
                pageBox={pageViewport?.viewBox}
                onSelectPage={setActivePage}
                detectedFields={detectedFields}
                onDetectedFields={(fields) => {
                  setDetectState({ key: ocrPageKey, fields });
                }}
                autoDetectHandledRef={autoDetectHandledRef}
                pageSize={basePageSize}
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
            {editSubTool === "signature" && (
              <SignaturePanel
                onChoose={(signature) => {
                  setSelectedPending(null);
                  setStampPlacement(signature);
                }}
              />
            )}
          </div>
        )}
      </>
    );
  }

  function renderToolPanels() {
    return (
      <>
        {activeTool === "crop" && (
          <CropPanel
            docPath={path}
            pageWidth={basePageSize.width}
            pageHeight={basePageSize.height}
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
        {renderEditPanel()}
      </>
    );
  }

  function renderFocusedPage() {
    return (
      <div
        ref={pendingAnnotationHostRef}
        data-pending-annotation-host
        className="relative shrink-0"
        style={{ width: pageSize.width, height: pageSize.height }}
      >
        <PdfViewer
          pdf={pdf}
          pageIndex={activePage}
          zoom={zoom}
          className="block border border-[var(--color-border)] bg-[var(--color-surface-raised)]"
          hiddenAnnotationIds={replacedAnnotationIds}
        />
        {renderSearchHighlights()}
        {activeTool === "crop" && pageSize.width > 0 && (
          <CropOverlay
            width={pageSize.width}
            height={pageSize.height}
            rect={scaleCropRect(cropRect, zoom)}
            onRectChange={(screenRect) =>
              changeCropRect(scaleCropRect(screenRect, zoom > 0 ? 1 / zoom : 1))
            }
            docPath={path}
          />
        )}
        {renderPendingPreview()}
        {renderPendingEditor()}
        {renderPendingControls()}
        {renderOcrSelection()}
      </div>
    );
  }

  function renderBookSlot(pageIndex: number | null, facingPageIndex: number | null) {
    const size = visiblePageSizes[pageIndex ?? facingPageIndex ?? -1] ?? ZERO_SIZE;
    if (pageIndex === null) {
      return (
        <div
          aria-hidden="true"
          className="shrink-0 border border-[var(--color-border)] bg-[var(--color-well)]"
          style={{ width: size.width, height: size.height }}
        />
      );
    }
    if (pageIndex === activePage) return focusedPageSurface;
    return (
      <div className="relative shrink-0" style={{ width: size.width, height: size.height }}>
        <BookFacingPage
          pdf={pdf}
          pageIndex={pageIndex}
          zoom={zoom}
          size={size}
          baseSize={visibleBaseSizes[pageIndex] ?? ZERO_SIZE}
          viewport={visibleViewports[pageIndex] ?? null}
          pendingAnnotations={pendingAnnotations}
          formValues={formValues}
          hiddenAnnotationIds={replacedAnnotationIds}
          onSelect={() => setActivePage(pageIndex)}
        />
        {renderOwnFacingPreview(pageIndex, size)}
      </div>
    );
  }

  function renderOwnFacingPreview(pageIndex: number, size: { width: number; height: number }) {
    const viewport = visibleViewports[pageIndex];
    const ownFields = ownFieldsOnPage(pendingAnnotations, pageIndex);
    if (!viewport || ownFields.length === 0) return null;
    // BookFacingPage previews the existing value types. Own fields get a
    // separate read-only layer so mixed pages never draw those values twice.
    return (
      <PendingPreviewOverlay
        width={size.width}
        height={size.height}
        page={pageIndex}
        viewport={viewport}
        pendingAnnotations={ownFields}
        formValues={[]}
        pageWidth={visibleBaseSizes[pageIndex]?.width ?? 0}
        pageHeight={visibleBaseSizes[pageIndex]?.height ?? 0}
      />
    );
  }

  return renderWorkspaceShell();

  function renderWorkspaceShell() {
    return (
      <div className="k-compact flex h-full min-h-0 flex-col text-[length:var(--text-md)] text-[var(--color-text)]">
        <WorkspaceTopBar
          path={path}
          pageCount={pdf.numPages}
          activePage={activePage}
          onSelectPage={selectPage}
          onOpenSearch={openSearch}
          onOpenShortcuts={openShortcuts}
        />
        <ShortcutOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
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
          <aside className="shrink-0 border-r border-[var(--color-border)] bg-[var(--color-background)]">
            <ThumbnailStrip
              pdf={pdf}
              active={activePage}
              bookMode={bookMode}
              onSelect={(page, image) => {
                if (page === activePage) return;
                cancelCarry.current?.();
                cancelCarry.current = carryThumbnail(image ?? null, mainRef.current, page, () => selectPage(page));
              }}
              height={
                typeof window !== "undefined" ? window.innerHeight - (searchOpen ? 144 : 96) : 600
              }
              collapsed={thumbnailStripCollapsed}
              onToggleCollapsed={() => setThumbnailStripCollapsed(!thumbnailStripCollapsed)}
            />
          </aside>
          <main
            ref={mainRef}
            className="flex flex-1 items-start justify-center overflow-auto bg-[var(--color-well)] p-[var(--space-6)]"
          >
            {bookMode ? (
              <div
                data-book-spread
                className="flex shrink-0 items-start"
                style={{
                  gap: BOOK_GAP,
                  width: pairRenderedSize.width || undefined,
                  height: pairRenderedSize.height || undefined,
                }}
              >
                {renderBookSlot(activeSpread[0], activeSpread[1])}
                {renderBookSlot(activeSpread[1], activeSpread[0])}
              </div>
            ) : (
              focusedPageSurface
            )}
          </main>
          <aside className="w-72 shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-background)] p-[var(--space-3)]">
            {renderToolPanels()}{" "}
            {/* Compare uses a separate workspace shell (see WorkspaceRoute). */}
          </aside>
        </div>
      </div>
    );
  }
}

const EMPTY_FIELD_IDS = new Set<string>();
const NO_VALUES: SavedFreeText[] = [];
const ZERO_SIZE = { width: 0, height: 0 };
const EMPTY_PAGE_SIZES: Record<number, { width: number; height: number }> = {};
const EMPTY_VIEWPORTS: Record<number, pdfjs.PageViewport> = {};
// Fallback only: a selected pending annotation always has a rect, so
// `toScreenRect` only returns null for a malformed one from outside this app.
const EMPTY_SCREEN_RECT: ScreenRect = { x: 0, y: 0, width: 0, height: 0 };

function usePageFields({
  detectState,
  filledState,
  savedValues,
  pdf,
  activePage,
  ocrPageKey,
  ocrPageState,
  ocrSelection,
  activeTool,
  path,
  selectedPending,
}: {
  detectState: { key: string; fields: DetectedFormField[] | null };
  filledState: ReturnType<typeof useFilledFields.getState>["byDoc"][string];
  savedValues: { pdf: pdfjs.PDFDocumentProxy | null; page: number; values: SavedFreeText[] };
  pdf: pdfjs.PDFDocumentProxy;
  activePage: number;
  ocrPageKey: string;
  ocrPageState: { key: string; words: OcrSelectableWord[]; notice: string | null };
  ocrSelection: { key: string; ids: Set<number> };
  activeTool: ReturnType<typeof useWorkspace.getState>["activeTool"];
  path: string;
  selectedPending: { key: string; clientId: string } | null;
}) {
  const detectedFields = detectState.key === ocrPageKey ? detectState.fields : null;
  const filledIds = filledState.key === ocrPageKey ? filledState.ids : EMPTY_FIELD_IDS;
  const pageSavedValues =
    savedValues.pdf === pdf && savedValues.page === activePage ? savedValues.values : NO_VALUES;
  const shownFilledIds = useMemo(
    () =>
      detectedFields === null || pageSavedValues.length === 0
        ? filledIds
        : new Set([
          ...filledIds,
          ...fieldsWithSavedValues(
            detectedFields,
            pageSavedValues.map((value) => value.rect)
          ),
        ]),
    [detectedFields, filledIds, pageSavedValues]
  );
  const { ocrWords, ocrLayerNotice, ocrWordsLoading, selectedOcrWordIds } = pageOcrState(
    ocrPageState,
    ocrSelection,
    ocrPageKey,
    activeTool
  );
  const pendingAnnotations = useAnnotations((s) => s.byDoc[path] ?? NO_ANNOTATIONS);
  const selectedPendingId = selectedPending?.key === ocrPageKey ? selectedPending.clientId : null;
  const selectedPendingAnnotation = pendingAnnotations.find(
    (annotation) => !annotation.__deleted && annotation.__clientId === selectedPendingId
  );
  const selectedFreeText = pendingAnnotations.find(
    (a): a is ClientAnnotation & FreeTextAnnotation =>
      a.type === "free_text" && a.__clientId === selectedPendingId
  );
  // Plan 119 p1b: a saved value under a pending edit is not drawn, so the
  // page never shows the old and the new value on top of each other.
  const replacedAnnotationIds = useMemo(
    () =>
      pendingAnnotations.flatMap((annotation) =>
        annotation.__replaces === undefined ? [] : [pdfjsAnnotationId(annotation.__replaces)]
      ),
    [pendingAnnotations]
  );
  // Plan 119 p1c: AcroForm values typed in the Forms panel and not yet
  // saved are drawn on the page too.
  const formDraft = useFormDrafts((s) => s.byDoc[path] ?? NO_FORM_DRAFT);
  const formValues = useMemo(() => pendingFormValues(formDraft), [formDraft]);
  const hasPendingOnPage =
    pageHasPendingValue(pendingAnnotations, formValues, activePage) ||
    ownFieldsOnPage(pendingAnnotations, activePage).length > 0;
  return {
    detectedFields,
    filledIds,
    pageSavedValues,
    shownFilledIds,
    ocrWords,
    ocrLayerNotice,
    ocrWordsLoading,
    selectedOcrWordIds,
    pendingAnnotations,
    selectedPendingId,
    selectedPendingAnnotation,
    selectedFreeText,
    replacedAnnotationIds,
    formDraft,
    formValues,
    hasPendingOnPage,
  };
}

function ownFieldsOnPage(annotations: ClientAnnotation[], page: number) {
  return annotations.filter((item) => item.type === "form_field" && !item.__deleted && item.page === page);
}

function useSearchResults(
  textIndexState: CachedTextIndex | null,
  path: string,
  pdf: pdfjs.PDFDocumentProxy,
  searchQuery: string,
  searchMatchIndex: number,
  activePage: number
) {
  const cachedTextIndex =
    textIndexState?.path === path && textIndexState.pdf === pdf ? textIndexState : null;
  const indexedPages = cachedTextIndex?.pdf === pdf ? cachedTextIndex.pages : EMPTY_TEXT_INDEX;
  const searchMatches = useMemo(
    () => findMatches(indexedPages, searchQuery),
    [indexedPages, searchQuery]
  );
  const currentSearchMatchIndex =
    searchMatches.length === 0 ? 0 : Math.min(searchMatchIndex, searchMatches.length - 1);
  const currentSearchMatch = searchMatches[currentSearchMatchIndex];
  const currentPageMatches = searchMatches.filter((match) => match.page === activePage);
  const searchIndexing = cachedTextIndex?.pdf !== pdf || !cachedTextIndex.complete;
  return {
    cachedTextIndex,
    indexedPages,
    searchMatches,
    currentSearchMatchIndex,
    currentSearchMatch,
    currentPageMatches,
    searchIndexing,
  };
}

function useSpreadState(
  activePage: number,
  pdf: pdfjs.PDFDocumentProxy,
  bookMode: boolean,
  spreadMeasurement: SpreadMeasurement | null
) {
  const activeSpread = useMemo<PagePair>(
    () => spreadFor(activePage, pdf.numPages) ?? [null, activePage],
    [activePage, pdf.numPages]
  );
  const spreadKey = bookMode
    ? `spread:${activeSpread[0] ?? "empty"}:${activeSpread[1] ?? "empty"}`
    : `page:${activePage}`;
  const currentSpreadMeasurement =
    spreadMeasurement?.pdf === pdf && spreadMeasurement.key === spreadKey
      ? spreadMeasurement
      : null;
  const { pairBaseSize, pairRenderedSize, visiblePageSizes, visibleBaseSizes, visibleViewports } =
    spreadSizes(currentSpreadMeasurement);
  return {
    activeSpread,
    spreadKey,
    currentSpreadMeasurement,
    pairBaseSize,
    pairRenderedSize,
    visiblePageSizes,
    visibleBaseSizes,
    visibleViewports,
  };
}

function pageOcrState(
  ocrPageState: { key: string; words: OcrSelectableWord[]; notice: string | null },
  ocrSelection: { key: string; ids: Set<number> },
  ocrPageKey: string,
  activeTool: string
) {
  const ocrWords = ocrPageState.key === ocrPageKey ? ocrPageState.words : [];
  const ocrLayerNotice = ocrPageState.key === ocrPageKey ? ocrPageState.notice : null;
  const ocrWordsLoading = activeTool === "ocr" && ocrPageState.key !== ocrPageKey;
  const selectedOcrWordIds = ocrSelection.key === ocrPageKey ? ocrSelection.ids : new Set<number>();
  return { ocrWords, ocrLayerNotice, ocrWordsLoading, selectedOcrWordIds };
}

function spreadSizes(measurement: SpreadMeasurement | null) {
  if (!measurement)
    return {
      pairBaseSize: ZERO_SIZE,
      pairRenderedSize: ZERO_SIZE,
      visiblePageSizes: EMPTY_PAGE_SIZES,
      visibleBaseSizes: EMPTY_PAGE_SIZES,
      visibleViewports: EMPTY_VIEWPORTS,
    };
  return {
    pairBaseSize: measurement.baseSize,
    pairRenderedSize: measurement.renderedSize,
    visiblePageSizes: measurement.pageSizes,
    visibleBaseSizes: measurement.baseSizes,
    visibleViewports: measurement.viewports,
  };
}

function measuredSpreadPage(
  byPage: Map<number, PageMeasurement>,
  spread: PagePair,
  activePage: number,
  fallback: PageMeasurement
) {
  return byPage.get(spread[0] ?? spread[1] ?? activePage) ?? fallback;
}
