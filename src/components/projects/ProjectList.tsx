// Phase 15 Task 79 — Project list page.
//
// Queries `project_list` once on mount via the projects store, renders a
// responsive grid of cards (one card per project) plus a top-right
// "+ New" button that opens a name dialog and routes to the detail page
// on create.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FileUp, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenFiles } from "@/components/opening/openFilesContext";
import { useProjectsStore } from "@/stores/projectsStore";

export function ProjectList() {
  const { t } = useTranslation("common");
  const projects = useProjectsStore((s) => s.projects);
  const loading = useProjectsStore((s) => s.loading);
  const refresh = useProjectsStore((s) => s.refresh);
  const createProject = useProjectsStore((s) => s.create);
  const { browseForPdfs } = useOpenFiles();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Queue the load on a microtask so it lands after the render commit
    // (avoid setState-in-effect lint).
    void Promise.resolve().then(() => {
      void refresh();
    });
  }, [refresh]);

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    const id = await createProject(name.trim(), null);
    setBusy(false);
    if (id !== null) {
      setShowNew(false);
      setName("");
      navigate({ to: "/projects/$id", params: { id: String(id) } });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("tools.projects")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void browseForPdfs()}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t("browse")}
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("projects.new")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-lg border-2 border-dashed border-[var(--color-border)] px-5 py-4">
        <FileUp className="h-7 w-7 shrink-0 text-[var(--color-muted)]" />
        <div>
          <p className="font-medium">{t("projects.open_title")}</p>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {t("projects.open_description")}
          </p>
        </div>
      </div>

      {loading && projects.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">{t("loading")}</p>
      )}
      {!loading && projects.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">{t("projects.empty")}</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            to="/projects/$id"
            params={{ id: String(p.id) }}
            className="block rounded border border-[var(--color-border)] bg-[var(--color-card)] p-4 hover:bg-[var(--color-control-hover)]"
          >
            <div className="font-medium">{p.name}</div>
            {p.description && (
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {p.description}
              </div>
            )}
            <div className="mt-2 text-xs text-[var(--color-muted)]">
              Updated {new Date(p.updated_at).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-soft)]">
          <div className="w-96 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t("projects.new")}</h2>
            <input
              className="mt-3 block w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.name")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreate();
                if (e.key === "Escape") setShowNew(false);
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={onCreate} disabled={busy || !name.trim()}>
                {busy ? t("projects.creating") : t("projects.create")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
