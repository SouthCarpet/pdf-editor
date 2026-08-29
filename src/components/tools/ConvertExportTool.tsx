import { pickPaths } from "@/tauri/bridge";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";
import {
  ConvertExportOptions,
  DEFAULT_CONVERT_EXPORT_OPTIONS,
  type ConvertExportOptionsValue,
} from "./options/ConvertExportOptions";

export function ConvertExportTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [options, setOptions] = useState<ConvertExportOptionsValue>(DEFAULT_CONVERT_EXPORT_OPTIONS);
  const { run, cancelActive, activeId } = useToolJob("convert_export");

  async function onRun() {
    if (!file) return;
    const [dir] = await pickPaths({ directory: true, multiple: false });
    if (!dir) return;
    await run(
      "convert_pdf_export_cmd",
      { args: { input: file, format: options.format, outDir: dir, jobId: "" } },
      [file]
    ).catch(() => {});
  }

  return (
    <ToolPage title={t("tools.convert_export")} description={t("tools:convert_export.description")}>
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <ConvertExportOptions value={options} onChange={setOptions} mode="standalone" />
      <div className="flex gap-2">
        <Button disabled={!file || !!activeId} onClick={onRun}>
          {t("tools:convert_export.run")}
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
