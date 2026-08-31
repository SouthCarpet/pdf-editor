// Route-component for /workspace/$docId. Lives separately from the
// TanStack `Route = createFileRoute(...)` definition so the route file
// only exports the `Route` object (keeps React Refresh / Fast Refresh
// happy: the warning fires when a route file mixes route exports with
// any other component).
//
// Phase 11 Task 62 / 65: read the optional `?tool=` search param so the
// dashboard can land directly on a specific workspace tool. `tool=compare`
// is special-cased into a two-document workspace (no single-doc state).
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import type { OcrResult, TextDiffResult, VisualDiffPage } from "@/bindings";
import { decodeDocId } from "@/lib/docId";
import { hasUnsavedWork } from "@/lib/unsavedWork";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { useAppStore } from "@/stores/appStore";
import { useDocuments } from "@/stores/documentStore";
import { useCloseGuard } from "@/stores/closeGuardStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { pickPaths, pickSavePath } from "@/tauri/bridge";
import { ScanDetectedDialog, type OcrSelections } from "@/components/ScanDetectedDialog";
import { CompareViewer } from "./CompareViewer";
import { ComparePanel } from "./tools/ComparePanel";
import { DocumentAutosave } from "./DocumentAutosave";
import { Workspace } from "./Workspace";

// AppError serialises as `{ key, data }` (see src-tauri/src/error.rs), and the
// commands throw that object directly. It is NOT an Error, so it has no
// `.message`: `String(err?.message ?? err)` fell through to `String(object)` and
// rendered the literal text "[object Object]" to the user. The key was there the
// whole time, and every key already has a translation in errors.json.
type AppErrorShape = { key: string; data?: Record<string, unknown> };

function isAppError(e: unknown): e is AppErrorShape {
  return typeof e === "object" && e !== null && typeof (e as AppErrorShape).key === "string";
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}


export function WorkspaceRoute() {
  const { t } = useTranslation("common");
  const { docId } = useParams({ from: "/workspace/$docId" });
  const search = useSearch({ from: "/workspace/$docId" });
  const navigate = useNavigate();
  const addDoc = useDocuments((s) => s.add);
  const closeDoc = useDocuments((s) => s.close);
  const setActiveDoc = useDocuments((s) => s.setActive);
  const setTool = useWorkspace((s) => s.setTool);
  // Plan 050 task D2-UX: lifted into the workspace store so the Text tool's
  // scanned-page empty state can open this dialog directly (see R4). Plan
  // 062 T1.2 (R1): WorkspaceRoute itself no longer calls `openOcrPrompt` -
  // the dialog opens only from that explicit "Spustiť OCR" action (or the
  // OCR toolbar tab), never automatically on open.
  const ocrPromptOpen = useWorkspace((s) => s.ocrPromptOpen);
  const closeOcrPrompt = useWorkspace((s) => s.closeOcrPrompt);
  const getZoom = useWorkspace((s) => s.getZoom);
  const setZoom = useWorkspace((s) => s.setZoom);
  const openCloseGuard = useCloseGuard((s) => s.open);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<
    { key: string | null; data: Record<string, unknown>; raw?: string } | null
  >(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrOutputPath, setOcrOutputPath] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Apply the tool search param exactly once on first mount.
  useEffect(() => {
    if (search.tool) setTool(search.tool);
  }, [search.tool, setTool]);

  // Phase 17 Task 87 - persist last-session slot on doc open + on
  // unmount. v1 single-slot (slot=0); multi-tab is follow-up.
  useEffect(() => {
    if (!path) return;
    const tool = search.tool ?? "edit";
    commands
      .sessionSave({
        slot: 0,
        doc_path: path,
        tool,
        scroll_y: 0,
        zoom: 1.0,
      })
      .catch(() => {});
    return () => {
      // On unmount keep the slot (so a relaunch restores it). The
      // "Discard" button in SessionRestorePrompt clears explicitly.
    };
  }, [path, search.tool]);

  const isCompareMode = search.tool === "compare";

  // Resolve docId to an absolute file path. "new" triggers the picker; anything
  // else is the percent-encoded absolute path and MUST be decoded first (see
  // decodeDocId above - the previous comment here claimed the router did it).
  // Skipped entirely in compare mode - we don't load a single doc.
  useEffect(() => {
    if (isCompareMode) return;
    let cancelled = false;
    (async () => {
      if (docId === "new") {
        const picked = await pickPaths({
          multiple: false,
          directory: false,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (cancelled) return;
        const absolute = picked[0];
        if (!absolute) {
          navigate({ to: "/" });
          return;
        }
        await loadAndRegister(absolute);
        if (cancelled) return;
        // Replace history so the back button doesn't re-trigger the picker.
        navigate({
          to: "/workspace/$docId",
          params: { docId: encodeURIComponent(absolute) },
          search,
          replace: true,
        });
      } else {
        await loadAndRegister(decodeDocId(docId));
      }
    })().catch((err: unknown) => {
      // Log before rendering. The app log previously recorded nothing at all for
      // a failed open - only "logging initialized" lines - so a user reporting
      // "it will not open" left no trace anywhere to diagnose from.
      console.error("[workspace] open failed", { docId, err });
      if (cancelled) return;
      if (isAppError(err)) {
        setError({ key: err.key, data: err.data ?? {} });
        return;
      }
      const msg =
        err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setError({ key: null, data: {}, raw: msg });
    });
    return () => {
      cancelled = true;
    };

    async function loadAndRegister(p: string) {
      await Promise.resolve();
      const cached = useDocuments.getState().documents.get(p);
      let resolvedPath: string;
      if (cached) {
        resolvedPath = cached.path;
        setActiveDoc(cached.id);
      } else {
        const opened = await commands.openDocument(p);
        if (opened.status === "error") throw opened.error;
        const doc = opened.data;
        resolvedPath = doc.path;
        addDoc({
          id: doc.path,
          path: doc.path,
          pageCount: doc.page_count,
          dirty: false,
        });
        if (useWorkspace.getState().zoomByDoc[doc.path] === undefined) {
          useWorkspace.getState().setZoom(doc.path, useAppStore.getState().defaultZoom);
        }
      }
      if (!cancelled) {
        setError(null);
        setPath(resolvedPath);
      }
      // Phase 13 Task 71 used to kick off scan detection here and
      // auto-open the OCR dialog on every open (defect, plan 062 T1.2:
      // Michal reported the prompt appearing on every document, scanned
      // or not, with no way to dismiss it for good). Scan detection
      // itself still runs - `EditTextPanel` calls `detectScannedPdf`
      // itself to drive its own scanned-page empty state - so removing
      // this duplicate call here only removes the auto-prompt, not the
      // detection.
    }
  }, [docId, navigate, addDoc, setActiveDoc, search, isCompareMode]);

  async function onRunOcr(sel: OcrSelections) {
    if (!path) return;
    closeOcrPrompt();
    const out = await pickSavePath({
      defaultPath: path.replace(/\.pdf$/i, ".ocr.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    setOcrError(null);
    setOcrResult(null);
    setOcrOutputPath(null);
    const result = await commands.ocrPdfCmd({
      input: path,
      output: out,
      options: {
        engine: sel.engine,
        language: sel.languages.join("+"),
        dpi: sel.dpi,
        psm: sel.psm,
        oem: 3,
        output: "searchable_pdf",
        deskew: true,
        despeckle: false,
        preserve_raster: true,
      },
      job_id: crypto.randomUUID(),
    });
    if (result.status === "ok") {
      setOcrResult(result.data);
      setOcrOutputPath(out);
      // Plan 062 T1.4: the OCR job writes a separate searchable PDF: the
      // open document is untouched, so the Text panel kept showing the
      // "scanned, no text layer" empty state even after a successful run.
      // Open the result so the panel reflects what OCR actually produced.
      void openOcrResult(path, out);
    } else {
      setOcrError(JSON.stringify(result.error));
    }
  }

  // A tab is identified by its document path (`documentStore` keys on
  // it), so there is no way to swap a tab's path in place. Closing the
  // scanned original and opening the searchable result as a new,
  // focused tab is the fallback R2 names for that case.
  async function openOcrResult(originalPath: string, outputPath: string) {
    const swap = () => void swapDocument(originalPath, outputPath);
    if (hasUnsavedWork(originalPath)) {
      // Reuse the close-guard dialog (Save / Discard / Cancel) instead of
      // silently dropping pending annotations or an in-progress text
      // edit on the original when it is replaced.
      openCloseGuard({ kind: "tab", docId: originalPath, onClosed: swap });
      return;
    }
    swap();
  }

  async function swapDocument(originalPath: string, outputPath: string) {
    const opened = await commands.openDocument(outputPath);
    if (opened.status === "error") {
      setOcrError(JSON.stringify(opened.error));
      return;
    }
    const doc = opened.data;
    setZoom(doc.path, getZoom(originalPath));
    addDoc({ id: doc.path, path: doc.path, pageCount: doc.page_count, dirty: false });
    closeDoc(originalPath);
    void navigate({
      to: "/workspace/$docId",
      params: { docId: encodeURIComponent(doc.path) },
      search,
      replace: true,
    });
  }

  const pdfDoc = usePdfDocument(path);

  if (error) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-[var(--color-danger-text)]">
          {t("opening.failed_document", {
            // Every AppError key has an entry in errors.json, so translate it
            // rather than stringifying the payload. The raw fallback only runs
            // for a throw that is not an AppError at all.
            error: error.key
              ? t(`errors:${error.key}`, { ...error.data, defaultValue: error.key })
              : (error.raw ?? ""),
          })}
        </p>
        {/* The path is the single most useful diagnostic when an open fails and
            it was previously discarded. Shown small rather than hidden, because
            "it will not open" with no path is unactionable for the user and for
            anyone they report it to. */}
        <p className="break-all font-mono text-xs text-[var(--color-muted)]">
          {decodeDocId(docId)}
        </p>
        <Button onClick={() => navigate({ to: "/projects" })}>
          {t("projects.back_to_projects")}
        </Button>
      </div>
    );
  }
  if (isCompareMode) {
    return <CompareWorkspace initialLeftPath={docId === "new" ? null : decodeDocId(docId)} />;
  }
  if (!path || !pdfDoc) {
    return <div className="p-6 text-[var(--color-muted)]">{t("loading")}</div>;
  }
  return (
    <>
      <Workspace pdf={pdfDoc.pdf} path={path} />
      <DocumentAutosave key={path} path={path} />
      <ScanDetectedDialog open={ocrPromptOpen} onClose={closeOcrPrompt} onRunOcr={onRunOcr} />
      {(ocrResult || ocrError) && (
        <div
          role={ocrError ? "alert" : "status"}
          aria-live={ocrError ? "assertive" : "polite"}
          className="fixed right-5 bottom-5 z-50 w-[min(420px,calc(100vw-2.5rem))] rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-balance">
                {t(ocrError ? "ocr_result.failed_title" : "ocr_result.title")}
              </h2>
              {ocrResult && (
                <p className="mt-1 text-xs text-[var(--color-muted)] tabular-nums">
                  {t("ocr_result.summary", {
                    pages: ocrResult.pages_processed,
                    characters: ocrResult.characters_recognized,
                  })}
                </p>
              )}
              {ocrResult && ocrOutputPath && (
                <p className="mt-1 truncate text-xs text-[var(--color-muted)]" title={ocrOutputPath}>
                  {t("ocr_result.output_file", { name: fileName(ocrOutputPath) })}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label={t("ocr_result.close")}
              onClick={() => {
                setOcrResult(null);
                setOcrOutputPath(null);
                setOcrError(null);
              }}
              className="-m-2 inline-flex size-10 items-center justify-center rounded-md text-[var(--color-muted)] transition-transform duration-150 ease-out hover:text-[var(--color-foreground)] active:scale-[0.96]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {ocrError && (
            <p className="mt-3 text-xs text-[var(--color-danger-text)]">
              {t("ocr_result.failed", { error: ocrError })}
            </p>
          )}
          {ocrResult && (
            <div className="mt-3 space-y-2 text-xs">
              <p>{t("ocr_result.engine", { engine: ocrResult.engine })}</p>
              {ocrResult.backend_notice && (
                <p
                  title={ocrResult.backend_notice}
                  className="rounded border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2 py-1.5 text-[var(--color-warning-soft-foreground)]"
                >
                  {t("ocr_result.fallback")}
                </p>
              )}
              <p className="tabular-nums">
                {ocrResult.average_confidence == null
                  ? t("ocr_result.confidence_unavailable")
                  : t("ocr_result.confidence", {
                      value: ocrResult.average_confidence.toFixed(1),
                    })}
              </p>
              {ocrResult.low_confidence_pages.length > 0 && (
                <div>
                  <p className="font-medium text-[var(--color-warning)]">
                    {t("ocr_result.low_confidence")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ocrResult.page_confidences
                      .filter((page) => page.low_confidence)
                      .map((page) => (
                        <span
                          key={page.page_number}
                          className="rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[var(--color-warning-soft-foreground)] tabular-nums"
                        >
                          {t("ocr_result.page_badge", {
                            page: page.page_number,
                            value: page.confidence?.toFixed(1) ?? "?",
                          })}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              {ocrResult.cache_hits > 0 && (
                <p className="text-[var(--color-muted)]">
                  {t("ocr_result.cache_hits", { count: ocrResult.cache_hits })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------- Compare-mode workspace shell ----------

function CompareWorkspace({ initialLeftPath }: { initialLeftPath: string | null }) {
  const { t } = useTranslation("workspace");
  const [leftPath, setLeftPath] = useState<string | null>(initialLeftPath);
  const [rightPath, setRightPath] = useState<string | null>(null);
  const [mode, setMode] = useState<"visual" | "text">("visual");
  const [visualResult, setVisualResult] = useState<VisualDiffPage[] | null>(null);
  const [textResult, setTextResult] = useState<TextDiffResult | null>(null);

  const ready = leftPath !== null && rightPath !== null;

  return (
    <div className="flex h-full min-h-0">
      <main className="flex-1 overflow-hidden">
        {ready ? (
          <CompareViewer
            leftPath={leftPath}
            rightPath={rightPath}
            mode={mode}
            visualResult={visualResult}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
            {t("compare.viewer_empty")}
          </div>
        )}
      </main>
      <aside className="w-72 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <ComparePanel
          leftPath={leftPath}
          rightPath={rightPath}
          mode={mode}
          setLeftPath={setLeftPath}
          setRightPath={setRightPath}
          setMode={setMode}
          onVisualResult={setVisualResult}
          onTextResult={setTextResult}
          visualResult={visualResult}
          textResult={textResult}
        />
      </aside>
    </div>
  );
}
