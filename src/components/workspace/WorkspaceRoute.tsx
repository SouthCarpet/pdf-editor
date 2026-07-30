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
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import type { OcrResult, TextDiffResult, VisualDiffPage } from "@/bindings";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { ScanDetectedDialog, type OcrSelections } from "@/components/ScanDetectedDialog";
import { CompareViewer } from "./CompareViewer";
import { ComparePanel } from "./tools/ComparePanel";
import { Workspace } from "./Workspace";

export function WorkspaceRoute() {
  const { t } = useTranslation("common");
  const { docId } = useParams({ from: "/workspace/$docId" });
  const search = useSearch({ from: "/workspace/$docId" });
  const navigate = useNavigate();
  const addDoc = useDocuments((s) => s.add);
  const setActiveDoc = useDocuments((s) => s.setActive);
  const setTool = useWorkspace((s) => s.setTool);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Apply the tool search param exactly once on first mount.
  useEffect(() => {
    if (search.tool) setTool(search.tool);
  }, [search.tool, setTool]);

  // Phase 17 Task 87 — persist last-session slot on doc open + on
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

  // Resolve docId → absolute file path. "new" triggers the picker; anything
  // else is the URL-encoded absolute path (TanStack params are decoded by
  // the router, so we don't need decodeURIComponent here).
  // Skipped entirely in compare mode — we don't load a single doc.
  useEffect(() => {
    if (isCompareMode) return;
    let cancelled = false;
    (async () => {
      if (docId === "new") {
        const picked = await openDialog({
          multiple: false,
          directory: false,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (cancelled) return;
        if (!picked) {
          navigate({ to: "/" });
          return;
        }
        const absolute = typeof picked === "string" ? picked : picked;
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
        await loadAndRegister(docId);
      }
    })().catch((err) => {
      if (!cancelled) setError(String(err?.message ?? err));
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
      }
      if (!cancelled) {
        setError(null);
        setPath(resolvedPath);
      }
      // Phase 13 Task 71 — kick off scan detection in the background.
      const detect = await commands.detectScannedPdf(resolvedPath);
      if (cancelled) return;
      if (detect.status === "ok" && detect.data.is_likely_scanned) {
        setScanDialogOpen(true);
      }
    }
  }, [docId, navigate, addDoc, setActiveDoc, search, isCompareMode]);

  async function onRunOcr(sel: OcrSelections) {
    if (!path) return;
    setScanDialogOpen(false);
    const out = await saveDialog({
      defaultPath: path.replace(/\.pdf$/i, ".ocr.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    setOcrError(null);
    setOcrResult(null);
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
    } else {
      setOcrError(JSON.stringify(result.error));
    }
  }

  const pdfDoc = usePdfDocument(path);

  if (error) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-[var(--color-danger-text)]">{t("opening.failed_document", { error })}</p>
        <Button onClick={() => navigate({ to: "/projects" })}>
          {t("projects.back_to_projects")}
        </Button>
      </div>
    );
  }
  if (isCompareMode) {
    return <CompareWorkspace />;
  }
  if (!path || !pdfDoc) {
    return <div className="p-6 text-[var(--color-muted)]">Loading…</div>;
  }
  return (
    <>
      <Workspace pdf={pdfDoc.pdf} path={path} />
      <ScanDetectedDialog
        open={scanDialogOpen}
        onClose={() => setScanDialogOpen(false)}
        onRunOcr={onRunOcr}
      />
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
            </div>
            <button
              type="button"
              aria-label={t("ocr_result.close")}
              onClick={() => {
                setOcrResult(null);
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

function CompareWorkspace() {
  const [leftPath, setLeftPath] = useState<string | null>(null);
  const [rightPath, setRightPath] = useState<string | null>(null);
  const [mode, setMode] = useState<"visual" | "text">("visual");
  const [visualResult, setVisualResult] = useState<VisualDiffPage[] | null>(null);
  const [textResult, setTextResult] = useState<TextDiffResult | null>(null);

  const ready = leftPath && rightPath;

  return (
    <div className="flex h-full min-h-0">
      <main className="flex-1 overflow-hidden">
        {ready ? (
          <CompareViewer
            leftPath={leftPath!}
            rightPath={rightPath!}
            mode={mode}
            visualResult={visualResult}
            textResult={textResult}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
            Pick a left and right PDF in the panel to begin.
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
        />
      </aside>
    </div>
  );
}
