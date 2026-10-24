import { useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDocuments, type OpenDocument } from "@/stores/documentStore";
import { useCloseGuard } from "@/stores/closeGuardStore";
import { hasUnsavedWork, useHasUnsavedWork } from "@/lib/unsavedWork";

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
  const openCloseGuard = useCloseGuard((state) => state.open);

  if (documents.length === 0) return null;

  function activate(path: string) {
    setActive(path);
    void navigate({
      to: "/workspace/$docId",
      params: { docId: encodeURIComponent(path) },
    });
  }

  // The actual tab removal, unconditional. `closeTab` below gates this
  // behind the close guard when the document has unsaved work (plan 050
  // task D2-UX-2, R3); the guard's "Neukladať"/"Uložiť" actions call this
  // as their completion callback.
  function performClose(path: string) {
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

  function closeTab(path: string) {
    if (hasUnsavedWork(path)) {
      openCloseGuard({ kind: "tab", docId: path, onClosed: () => performClose(path) });
      return;
    }
    performClose(path);
  }

  return (
    <nav
      aria-label={t("opening.open_documents")}
      className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2"
    >
      {documents.map((document) => (
        <DocumentTabItem
          key={document.id}
          document={document}
          active={document.id === activeDocId}
          onActivate={() => activate(document.path)}
          onClose={() => closeTab(document.id)}
        />
      ))}
    </nav>
  );
}

/** One open document. The active tab follows the Kaliber tab: the selected
 * fill, bold text and a square accent mark. The mark slot is always there,
 * so a selection never moves a name. */
function DocumentTabItem({
  document,
  active,
  onActivate,
  onClose,
}: {
  document: OpenDocument;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const dirty = useHasUnsavedWork(document.id);
  const name = fileName(document.path);

  return (
    <div
      className={`flex h-8 max-w-56 shrink-0 items-center rounded-t-[var(--radius-sm)] ${
        active
          ? "bg-[var(--color-surface-selected)] font-bold text-[var(--color-text)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-sm"
        title={document.path}
        onClick={onActivate}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 ${active ? "bg-[var(--color-accent)]" : "bg-transparent"}`}
        />
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{name}</span>
        {dirty && (
          <span
            className="h-1.5 w-1.5 shrink-0 bg-[var(--color-text)]"
            aria-label={t("opening.unsaved_changes")}
          />
        )}
      </button>
      <button
        type="button"
        className="k-x-btn mr-1"
        aria-label={t("opening.close_document", { name })}
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}