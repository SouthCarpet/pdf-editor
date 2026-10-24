// Phase 15 Task 79 - Project list page, Kaliber r4 (plan 119 K3b).
//
// The project ledger is the lead element (R24, R34 b): a ruled table on the
// paper with the name first, the description next and the update date as a
// right-aligned tabular figure. The count sits in one muted line under the
// title. Opening PDFs is a quiet row below the table, not a dashed card.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FileUp, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOpenFiles } from "@/components/opening/openFilesContext";
import { useProjectsStore } from "@/stores/projectsStore";
import { useCountLabels } from "./useCountLabels";

export function ProjectList() {
  const { t, i18n } = useTranslation("common");
  const counts = useCountLabels();
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

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="k-pagehead">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-bold text-balance">{t("tools.projects")}</h1>
          <p className="k-caption tabular-nums">{counts.projects(projects.length)}</p>
        </div>
        <Button variant="outline" onClick={() => void browseForPdfs()}>
          <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("browse")}
        </Button>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("projects.new")}
        </Button>
      </div>

      {loading && projects.length === 0 && <p className="k-caption">{t("loading")}</p>}
      {!loading && projects.length === 0 && <p className="k-caption">{t("projects.empty")}</p>}

      {projects.length > 0 && (
        <div className="k-table-wrap">
          <table className="k-table">
            <thead>
              <tr>
                <th scope="col">{t("projects.name")}</th>
                <th scope="col">{t("projects.description")}</th>
                <th scope="col" className="k-cell-number">
                  {t("projects.updated")}
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <Link
                      to="/projects/$id"
                      params={{ id: String(p.id) }}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </th>
                  <td className="text-[var(--color-text-muted)]">{p.description}</td>
                  <td className="k-cell-number tabular-nums text-[var(--color-text-muted)]">
                    {dateFormat.format(new Date(p.updated_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
        <FileUp className="h-5 w-5 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{t("projects.open_title")}</p>
          <p className="k-caption">{t("projects.open_description")}</p>
        </div>
      </div>

      <Dialog open={showNew} onOpenChange={(next) => !next && setShowNew(false)}>
        <DialogContent closeLabel={t("close")}>
          <DialogHeader>
            <DialogTitle>{t("projects.new")}</DialogTitle>
          </DialogHeader>
          <label className="k-field-block">
            <span className="k-label">{t("projects.name")}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreate();
              }}
            />
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={onCreate} disabled={busy || !name.trim()}>
              {busy ? t("projects.creating") : t("projects.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
