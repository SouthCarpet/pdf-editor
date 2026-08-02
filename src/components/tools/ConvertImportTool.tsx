import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";

const ACCEPT = [
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
  "bmp",
  "docx",
  "odt",
  "xlsx",
  "pptx",
  "html",
  "txt",
  "rtf",
  "epub",
];

export function ConvertImportTool() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const { run, cancelActive, activeId } = useToolJob("convert_import");

  async function onRun() {
    if (files.length === 0) return;
    const out = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "converted.pdf",
    });
    if (!out) return;
    await run(
      "convert_to_pdf_cmd",
      { args: { inputs: files, output: out, jobId: "" } },
      files,
    ).catch(() => {});
  }

  return (
    <ToolPage
      title={t("tools.convert_import")}
      description={t("tools:convert_import.description")}
    >
      <FileDropzone
        onFiles={(p) => setFiles((prev) => [...prev, ...p])}
        multiple
        accept={ACCEPT}
      />
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
        <Button disabled={files.length === 0 || !!activeId} onClick={onRun}>
          {t("ok")}
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
