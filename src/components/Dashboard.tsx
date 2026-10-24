import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolTile } from "./ToolTile";
import { Button } from "./ui/button";
import { useOpenFiles } from "./opening/openFilesContext";
import { TOOLS } from "@/config/tools";
import { useRecentFiles } from "@/stores/recentFilesStore";

// Home: the tool list is the lead element (R24). The app name and the Open
// action sit above it in small type; recent files and projects follow as
// ruled lists on the paper, not cards.
export function Dashboard() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const { browseForPdfs } = useOpenFiles();
  const { files, refresh } = useRecentFiles();
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const toolItems = TOOLS.filter((x) => x.category === "tool");
  const systemItems = TOOLS.filter((x) => x.category === "system");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="k-label">{t("title")}</h1>
        <Button className="gap-2" onClick={() => void browseForPdfs()}>
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          {t("open_pdfs")}
        </Button>
      </div>

      <section>
        <h2 className="mb-3 text-2xl font-bold">{t("tools_heading")}</h2>
        <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
          {toolItems.map((tool) => (
            <li key={tool.id}>
              <ToolTile tool={tool} />
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-[var(--color-border)] pt-6">
        <h2 className="k-label mb-3">{t("recent_heading")}</h2>
        {files.length === 0 ? (
          <p className="k-caption">{t("no_recent")}</p>
        ) : (
          <ul>
            {files.map((f) => (
              <li key={f.path}>
                {/* Was a bare <li> with the name as plain text: the list showed
                    what you had opened and gave you no way to open it again.
                    Same navigation idiom as DocumentTabs.activate. */}
                <button
                  type="button"
                  className="k-list-item min-h-[var(--control-h)] truncate rounded-md px-3 py-1"
                  title={f.path}
                  onClick={() =>
                    void navigate({
                      to: "/workspace/$docId",
                      params: { docId: encodeURIComponent(f.path) },
                    })
                  }
                >
                  {f.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-[var(--color-border)] pt-6">
        <h2 className="k-label mb-3">{t("projects_heading")}</h2>
        <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          {systemItems.map((tool) => (
            <li key={tool.id}>
              <ToolTile tool={tool} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
