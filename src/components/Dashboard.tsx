import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolTile } from "./ToolTile";
import { Button } from "./ui/button";
import { useOpenFiles } from "./opening/openFilesContext";
import { TOOLS } from "@/config/tools";
import { useRecentFiles } from "@/stores/recentFilesStore";

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
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button size="lg" className="gap-2" onClick={() => void browseForPdfs()}>
          <FolderOpen className="h-5 w-5" />
          {t("open_pdfs")}
        </Button>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("tools_heading")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {toolItems.map((tool) => (
            <ToolTile key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("recent_heading")}</h2>
        {files.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">{t("no_recent")}</p>
        ) : (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.path} className="text-sm">
                {/* Was a bare <li> with the name as plain text: the list showed
                    what you had opened and gave you no way to open it again.
                    Same navigation idiom as DocumentTabs.activate. */}
                <button
                  type="button"
                  className="min-h-10 w-full truncate rounded-md px-1 text-left underline-offset-2 hover:text-[var(--color-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
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

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("projects_heading")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {systemItems.map((tool) => (
            <ToolTile key={tool.id} tool={tool} />
          ))}
        </div>
      </section>
    </div>
  );
}
