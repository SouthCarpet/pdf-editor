import { pickSavePath } from "@/tauri/bridge";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { SelectedFiles } from "./SelectedFiles";
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
    const out = await pickSavePath({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "converted.pdf",
    });
    if (!out) return;
    await run(
      "convert_to_pdf_cmd",
      { args: { inputs: files, output: out, jobId: "" } },
      files
    ).catch(() => {});
  }

  return (
    <ToolPage title={t("tools.convert_import")} description={t("tools:convert_import.description")}>
      <FileDropzone onFiles={(p) => setFiles((prev) => [...prev, ...p])} multiple accept={ACCEPT} />
      <SelectedFiles files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))} />
      <div className="flex gap-2">
        <Button disabled={files.length === 0 || !!activeId} onClick={onRun}>
          {t("tools:convert_import.run")}
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
