import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";
import type { ExportFormat } from "@/bindings";

const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "png", label: "PNG (one per page)" },
  { value: "jpg", label: "JPG (one per page)" },
  { value: "tiff", label: "TIFF (multi-page)" },
  { value: "txt", label: "Plain text (.txt)" },
  { value: "html", label: "HTML" },
  { value: "docx", label: "Word (.docx)" },
  { value: "odt", label: "OpenDocument Text (.odt)" },
  { value: "rtf", label: "Rich Text (.rtf)" },
  { value: "epub", label: "EPUB" },
  { value: "pdfa", label: "PDF/A" },
];

export function ConvertExportTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("png");
  const { run, cancelActive, activeId } = useToolJob("convert_export");

  async function onRun() {
    if (!file) return;
    const dir = await open({ directory: true, multiple: false });
    if (!dir || Array.isArray(dir)) return;
    await run(
      "convert_pdf_export_cmd",
      { args: { input: file, format, outDir: dir, jobId: "" } },
      [file],
    ).catch(() => {});
  }

  return (
    <ToolPage
      title={t("tools.convert_export")}
      description="Export the PDF to images, text, office formats, or PDF/A."
    >
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <div className="space-y-1">
        <label className="text-sm text-[var(--color-muted)]">Output format</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button disabled={!file || !!activeId} onClick={onRun}>
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
