import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";
import {
  DEFAULT_OPTIMIZE_OPTIONS,
  OptimizeOptions,
  type OptimizeOptionsValue,
} from "./options/OptimizeOptions";

export function OptimizeTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [opts, setOpts] = useState<OptimizeOptionsValue>(DEFAULT_OPTIMIZE_OPTIONS);
  const { run, cancelActive, activeId } = useToolJob("optimize");

  async function onRun() {
    if (!file) return;
    const out = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "optimized.pdf",
    });
    if (!out) return;
    await run(
      "optimize_pdf_cmd",
      {
        args: {
          input: file,
          output: out,
          linearize: opts.linearize,
          removeUnused: opts.remove_unused,
          subsetFonts: opts.subset_fonts,
          objectStreams: opts.object_streams,
          stripMetadata: opts.strip_metadata,
          flattenAnnotations: opts.flatten_annotations,
          removeFormData: opts.remove_form_data,
          makeSearchableOcr: opts.ocr ? opts.ocr_lang : null,
          convertPdfa: opts.pdfa ? opts.pdfa_version : null,
          jobId: "",
        },
      },
      [file],
    ).catch(() => {});
  }

  return (
    <ToolPage
      title={t("tools.optimize")}
      description={t("tools:optimize.description")}
    >
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <OptimizeOptions value={opts} onChange={setOpts} mode="standalone" />
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
