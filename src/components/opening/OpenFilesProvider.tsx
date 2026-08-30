import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { documentToOpenAtStart } from "@/lib/documentToOpenAtStart";
import { filterPdfPaths } from "@/lib/fileOpening";
import { useAppStore } from "@/stores/appStore";
import { useDocuments } from "@/stores/documentStore";
import { useRecentFiles } from "@/stores/recentFilesStore";
import { useWorkspace } from "@/stores/workspaceStore";
import {
  onFileDrop,
  onOpenPaths,
  pathExists,
  pickPaths,
  startupPaths,
} from "@/tauri/bridge";
import { OpenFilesContext, type OpenFilesContextValue } from "./openFilesContext";
import { openPaths as openDocumentPaths, type OpenPathsResult } from "./openPaths";

export function OpenFilesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPaths = useCallback(
    async (paths: string[]): Promise<OpenPathsResult> => {
      setError(null);
      const result = await openDocumentPaths(paths, {
        listDocuments: () => useDocuments.getState().documents.values(),
        openDocument: commands.openDocument,
        addDocument: useDocuments.getState().add,
        initializeZoom: (path) => {
          const workspace = useWorkspace.getState();
          if (workspace.zoomByDoc[path] === undefined) {
            workspace.setZoom(path, useAppStore.getState().defaultZoom);
          }
        },
        focusDocument: async (path) => {
          useDocuments.getState().setActive(path);
          await navigate({
            to: "/workspace/$docId",
            params: { docId: encodeURIComponent(path) },
          });
        },
      });
      if (result.failed > 0) setError(t("opening.some_failed"));
      return result;
    },
    [navigate, t],
  );

  const browseForPdfs = useCallback(async () => {
    const selected = await pickPaths({
      multiple: true,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (selected.length > 0) await openPaths(selected);
  }, [openPaths]);

  useEffect(() => {
    let disposed = false;
    let stopDropListener: (() => void) | undefined;

    onFileDrop((event) => {
      if (event.kind === "over") {
        setDropActive(true);
        return;
      }
      setDropActive(false);
      if (event.kind !== "drop") return;

      const hasIgnoredFiles = filterPdfPaths(event.paths).length !== event.paths.length;
      void openPaths(event.paths).then((result) => {
        if (disposed || result.failed > 0) return;
        if (hasIgnoredFiles) setError(t("opening.non_pdf_ignored"));
      });
    })
      .then((stop) => {
        if (disposed) stop();
        else stopDropListener = stop;
      })
      .catch(() => {
        // Browser-only Vite preview has no Tauri event channel.
      });

    return () => {
      disposed = true;
      stopDropListener?.();
    };
  }, [openPaths, t]);

  useEffect(() => {
    let disposed = false;
    let stopOpenPathsListener: (() => void) | undefined;

    onOpenPaths((paths) => {
      if (!disposed) void openPaths(paths);
    })
      .then((stop) => {
        if (disposed) stop();
        else stopOpenPathsListener = stop;
      })
      .catch(() => {
        // Browser-only Vite preview has no Tauri event channel.
      });

    void (async () => {
      let initialPaths: string[];
      try {
        initialPaths = await startupPaths();
      } catch {
        initialPaths = [];
      }
      if (disposed) return;
      if (initialPaths.length > 0) {
        await openPaths(initialPaths);
        return;
      }
      if (!useAppStore.getState().openLastDocumentAtStart) return;

      try {
        await useRecentFiles.getState().refresh();
      } catch {
        return;
      }
      if (disposed) return;
      const files = useRecentFiles.getState().files;
      const candidate = files[0]?.path;
      if (!candidate) return;

      let onDisk = false;
      try {
        onDisk = await pathExists(candidate);
      } catch {
        onDisk = false;
      }
      if (disposed) return;
      const toOpen = documentToOpenAtStart(
        useAppStore.getState().openLastDocumentAtStart,
        files,
        (path) => path === candidate && onDisk,
      );
      if (toOpen) await openPaths([toOpen]);
    })();

    return () => {
      disposed = true;
      stopOpenPathsListener?.();
    };
  }, [openPaths]);

  const contextValue: OpenFilesContextValue = { browseForPdfs, openPaths };

  return (
    <OpenFilesContext.Provider value={contextValue}>
      {children}

      {dropActive && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-dropzone)]/95 text-[var(--color-foreground)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <FileUp className="h-9 w-9" />
            <div>
              <p className="font-semibold">{t("opening.drop_title")}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {t("opening.drop_description_tabs")}
              </p>
            </div>
          </div>
        </div>
      )}

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
