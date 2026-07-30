import { useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDocuments } from "@/stores/documentStore";

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function DocumentTabs() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const documentMap = useDocuments((state) => state.documents);
  const documents = Array.from(documentMap.values());
  const activeDocId = useDocuments((state) => state.activeDocId);
  const setActive = useDocuments((state) => state.setActive);
  const close = useDocuments((state) => state.close);

  if (documents.length === 0) return null;

  function activate(path: string) {
    setActive(path);
    void navigate({
      to: "/workspace/$docId",
      params: { docId: encodeURIComponent(path) },
    });
  }

  function closeTab(path: string) {
    const index = documents.findIndex((document) => document.id === path);
    const remaining = documents.filter((document) => document.id !== path);
    const wasActive = activeDocId === path;
    close(path);

    if (!wasActive) return;
    const next = remaining[Math.max(0, index - 1)] ?? remaining[0];
    if (next) {
      setActive(next.id);
      if (pathname.startsWith("/workspace/")) activate(next.path);
    } else if (pathname.startsWith("/workspace/")) {
      void navigate({ to: "/projects" });
    }
  }

  return (
    <nav
      aria-label={t("opening.open_documents")}
      className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-card)] px-2"
    >
      {documents.map((document) => {
        const active = document.id === activeDocId;
        const name = fileName(document.path);
        return (
          <div
            key={document.id}
            className={`flex h-8 max-w-56 shrink-0 items-center rounded-t-md border border-b-0 ${
              active
                ? "border-[var(--color-border)] bg-[var(--color-background)]"
                : "border-transparent text-[var(--color-muted)] hover:bg-[var(--color-control-hover)]"
            }`}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 text-sm"
              title={document.path}
              onClick={() => activate(document.path)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{name}</span>
              {document.dirty && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-foreground)]"
                  aria-label={t("opening.unsaved_changes")}
                />
              )}
            </button>
            <button
              type="button"
              className="mr-1 rounded p-1 hover:bg-[var(--color-control-active)]"
              aria-label={t("opening.close_document", { name })}
              onClick={() => closeTab(document.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </nav>
  );
}
