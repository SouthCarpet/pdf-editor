import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";

export function MergeTool() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const { run, cancelActive, activeId } = useToolJob("merge");

  async function onRun() {
    const out = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "merged.pdf",
    });
    if (!out) return;
    await run("merge_pdfs_cmd", { args: { inputs: files, output: out, jobId: "" } }, files).catch(
      () => {}
    );
  }

  return (
    <ToolPage title={t("tools.merge")} description={t("tools:merge.description")}>
      <FileDropzone onFiles={(p) => setFiles((prev) => [...prev, ...p])} multiple />
      <div className="space-y-2">
        {files.map((f, i) => (
          <div
            key={`${f}-${i}`}
            className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
          >
            <span className="truncate">{f}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
            >
              {t("delete")}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button disabled={files.length < 2 || !!activeId} onClick={onRun}>
          {t("tools:merge.run")}
        </Button>
        {activeId && (
          <Button variant="outline" onClick={cancelActive}>
            {t("cancel")}
          </Button>
        )}
      </div>
      <ProgressList />
    </ToolPage>
  );
}
