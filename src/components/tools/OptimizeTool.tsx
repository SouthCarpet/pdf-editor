import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";

interface OptimizeOptions {
  linearize: boolean;
  remove_unused: boolean;
  subset_fonts: boolean;
  object_streams: boolean;
  strip_metadata: boolean;
  flatten_annotations: boolean;
  remove_form_data: boolean;
  // Optional toggles that map to Some(...) when enabled.
  ocr: boolean;
  ocr_lang: string;
  pdfa: boolean;
  pdfa_version: number;
}

const DEFAULT: OptimizeOptions = {
  linearize: true,
  remove_unused: true,
  subset_fonts: true,
  object_streams: true,
  strip_metadata: false,
  flatten_annotations: false,
  remove_form_data: false,
  ocr: false,
  ocr_lang: "eng",
  pdfa: false,
  pdfa_version: 2,
};

export function OptimizeTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [opts, setOpts] = useState<OptimizeOptions>(DEFAULT);
  const { run, cancelActive, activeId } = useToolJob("optimize");

  function toggle<K extends keyof OptimizeOptions>(key: K, value: OptimizeOptions[K]) {
    setOpts((o) => ({ ...o, [key]: value }));
  }

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

  const checks: Array<[keyof OptimizeOptions, string]> = [
    ["linearize", "Linearize (fast web view)"],
    ["remove_unused", "Remove unused resources"],
    ["subset_fonts", "Subset embedded fonts"],
    ["object_streams", "Generate object streams"],
    ["flatten_annotations", "Flatten annotations"],
    ["strip_metadata", "Strip metadata"],
    ["remove_form_data", "Remove form data"],
  ];

  return (
    <ToolPage
      title={t("tools.optimize")}
      description="Run a pipeline of optimisations against the PDF."
    >
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <div className="space-y-2 rounded border p-3">
        {checks.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={opts[k] as boolean}
              onCheckedChange={(v) => toggle(k, Boolean(v) as OptimizeOptions[typeof k])}
            />
            <span>{label}</span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={opts.ocr}
            onCheckedChange={(v) => toggle("ocr", Boolean(v))}
          />
          <span>Make searchable (OCR) — language:</span>
          <input
            type="text"
            value={opts.ocr_lang}
            onChange={(e) => toggle("ocr_lang", e.target.value)}
            disabled={!opts.ocr}
            className="ml-2 h-8 w-24 rounded border px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={opts.pdfa}
            onCheckedChange={(v) => toggle("pdfa", Boolean(v))}
          />
          <span>Convert to PDF/A — version:</span>
          <select
            value={opts.pdfa_version}
            onChange={(e) => toggle("pdfa_version", Number(e.target.value))}
            disabled={!opts.pdfa}
            className="ml-2 h-8 rounded border px-2 text-sm"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
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
