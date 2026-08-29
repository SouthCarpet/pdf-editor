import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Combine, FileStack, FileUp, GripVertical, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  composeMergeInputs,
  movePath,
  normalizePdfPaths,
  type MergePlacement,
} from "@/lib/fileOpening";
import { useDocuments } from "@/stores/documentStore";
import { onFileDrop, pickPaths, pickSavePath } from "@/tauri/bridge";
import { OpenFilesContext, type OpenFilesContextValue } from "./openFilesContext";

type DialogStep = "choose" | "merge";

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function OpenFilesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const addDocument = useDocuments((state) => state.add);
  const documents = useDocuments((state) => state.documents);
  const activeDocId = useDocuments((state) => state.activeDocId);
  const activePath = activeDocId ? (documents.get(activeDocId)?.path ?? null) : null;

  const [dropActive, setDropActive] = useState(false);
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);
  const [step, setStep] = useState<DialogStep>("choose");
  const [placement, setPlacement] = useState<MergePlacement>("after");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetDialog() {
    setPendingPaths([]);
    setStep("choose");
    setPlacement("after");
    setDragFrom(null);
  }

  async function openInTabs(paths: string[]) {
    setBusy(true);
    setError(null);
    const opened = [];

    try {
      for (const path of paths) {
        try {
          const result = await commands.openDocument(path);
          if (result.status === "ok") {
            opened.push(result.data);
          } else {
            setError(t("opening.some_failed"));
          }
        } catch {
          setError(t("opening.some_failed"));
        }
      }

      for (const document of opened) {
        addDocument({
          id: document.path,
          path: document.path,
          pageCount: document.page_count,
          dirty: false,
        });
      }

      const last = opened.at(-1);
      if (last) {
        await navigate({
          to: "/workspace/$docId",
          params: { docId: encodeURIComponent(last.path) },
        });
      }
      return opened.length;
    } finally {
      setBusy(false);
    }
  }

  function requestOpen(paths: string[]) {
    const pdfs = normalizePdfPaths(paths);
    if (pdfs.length === 0) {
      setError(t("opening.pdf_only"));
      return;
    }
    setError(null);
    if (pdfs.length === 1) {
      void openInTabs(pdfs);
      return;
    }
    setPendingPaths(pdfs);
    setStep("choose");
    setPlacement("after");
  }

  async function browseForPdfs() {
    const selected = await pickPaths({
      multiple: true,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (selected.length === 0) return;
    requestOpen(selected);
  }

  const handleDroppedPaths = useEffectEvent((paths: string[]) => {
    requestOpen(paths);
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    onFileDrop((event) => {
      if (event.kind === "over") {
        setDropActive(true);
        return;
      }
      setDropActive(false);
      if (event.kind === "drop") handleDroppedPaths(event.paths);
    })
      .then((stop) => {
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch(() => {
        // Browser-only Vite preview has no Tauri event channel.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function onOpenTabs() {
    const count = await openInTabs(pendingPaths);
    if (count > 0) resetDialog();
  }

  async function onMerge() {
    const inputs = composeMergeInputs(pendingPaths, activePath, placement);
    if (inputs.length < 2) return;

    const output = await pickSavePath({
      defaultPath: "merged.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!output) return;

    setBusy(true);
    setError(null);
    try {
      const result = await commands.mergePdfsCmd({
        inputs,
        output,
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") {
        setError(t("opening.merge_failed"));
        return;
      }
      resetDialog();
      await openInTabs([output]);
    } catch {
      setError(t("opening.merge_failed"));
    } finally {
      setBusy(false);
    }
  }

  const contextValue: OpenFilesContextValue = { browseForPdfs, requestOpen };

  return (
    <OpenFilesContext.Provider value={contextValue}>
      {children}

      {dropActive && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-dropzone-border-active)] bg-[var(--color-dropzone)]/95 text-[var(--color-foreground)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <FileUp className="h-9 w-9" />
            <div>
              <p className="font-semibold">{t("opening.drop_title")}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {t("opening.drop_description")}
              </p>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={pendingPaths.length > 1}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) resetDialog();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden bg-[var(--color-card)] text-[var(--color-foreground)]">
          {step === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("opening.multiple_title", { count: pendingPaths.length })}
                </DialogTitle>
                <DialogDescription>{t("opening.multiple_description")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <button
                  type="button"
                  className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] p-4 text-left transition-colors hover:bg-[var(--color-control-hover)]"
                  onClick={() => void onOpenTabs()}
                  disabled={busy}
                >
                  <FileStack className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    <span className="block font-medium">{t("opening.open_tabs")}</span>
                    <span className="mt-1 block text-sm text-[var(--color-muted)]">
                      {t("opening.open_tabs_description")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] p-4 text-left transition-colors hover:bg-[var(--color-control-hover)]"
                  onClick={() => setStep("merge")}
                  disabled={busy}
                >
                  <Combine className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    <span className="block font-medium">{t("opening.merge_one")}</span>
                    <span className="mt-1 block text-sm text-[var(--color-muted)]">
                      {t("opening.merge_one_description")}
                    </span>
                  </span>
                </button>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={resetDialog} disabled={busy}>
                  {t("cancel")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("opening.merge_title")}</DialogTitle>
                <DialogDescription>{t("opening.merge_description")}</DialogDescription>
              </DialogHeader>

              {activePath ? (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    {t("opening.active_document", {
                      name: fileName(activePath),
                    })}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["before", "after"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={placement === value}
                        className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                          placement === value
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                            : "border-[var(--color-border)] hover:bg-[var(--color-control-hover)]"
                        }`}
                        onClick={() => setPlacement(value)}
                      >
                        {t(`opening.${value}_active`)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">
                  {t("opening.no_active_document")}
                </p>
              )}

              <ol className="max-h-72 space-y-1 overflow-auto pr-1">
                {pendingPaths.map((path, index) => (
                  <li
                    key={path}
                    draggable
                    onDragStart={() => setDragFrom(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragFrom !== null) {
                        setPendingPaths((current) => movePath(current, dragFrom, index));
                      }
                      setDragFrom(null);
                    }}
                    className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-2 text-sm"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                    <span className="w-6 text-center text-xs text-[var(--color-muted)]">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={path}>
                      {fileName(path)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t("opening.move_up", {
                        name: fileName(path),
                      })}
                      onClick={() =>
                        setPendingPaths((current) => movePath(current, index, index - 1))
                      }
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t("opening.move_down", {
                        name: fileName(path),
                      })}
                      onClick={() =>
                        setPendingPaths((current) => movePath(current, index, index + 1))
                      }
                      disabled={index === pendingPaths.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ol>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setStep("choose")} disabled={busy}>
                  {t("back")}
                </Button>
                <Button onClick={() => void onMerge()} disabled={busy}>
                  {busy ? t("opening.merging") : t("opening.save_merged")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {error && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[60] flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger-soft-foreground)] shadow-lg"
        >
          <span>{error}</span>
          <button
            type="button"
            className="rounded p-1 hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-soft-foreground)]"
            aria-label={t("close")}
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </OpenFilesContext.Provider>
  );
}
