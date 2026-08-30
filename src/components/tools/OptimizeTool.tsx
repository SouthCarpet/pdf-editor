import { invokeCommand, pickSavePath } from "@/tauri/bridge";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
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
import {
  estimatePercent,
  formatBytes,
  scheduleEstimate,
  type OptimizeEstimate,
} from "./optimizeEstimate";

export function OptimizeTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [opts, setOpts] = useState<OptimizeOptionsValue>(DEFAULT_OPTIMIZE_OPTIONS);
  const [estimate, setEstimate] = useState<OptimizeEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const { run, cancelActive, activeId } = useToolJob("optimize");

  useEffect(() => {
    if (!file) return;

    let active = true;
    const cancel = scheduleEstimate(() => {
      void invokeCommand<OptimizeEstimate>("estimate_optimize_cmd", {
        args: {
          input: file,
          options: {
            linearize: opts.linearize,
            remove_unused: opts.remove_unused,
            subset_fonts: opts.subset_fonts,
            object_streams: opts.object_streams,
            strip_metadata: opts.strip_metadata,
            flatten_annotations: opts.flatten_annotations,
            remove_form_data: opts.remove_form_data,
            make_searchable_ocr: opts.ocr ? opts.ocr_lang : null,
            convert_pdfa: opts.pdfa ? opts.pdfa_version : null,
            ocr_dpi: opts.ocr ? opts.ocr_dpi : null,
          },
        },
      })
        .then((result) => {
          if (active) setEstimate(result);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setEstimateError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (active) setEstimating(false);
        });
    });

    return () => {
      active = false;
      cancel();
    };
  }, [file, opts]);

  function selectFile(paths: string[]) {
    const next = paths[0] ?? null;
    setFile(next);
    setEstimate(null);
    setEstimateError(null);
    setEstimating(next !== null);
  }

  function changeOptions(next: OptimizeOptionsValue) {
    setOpts(next);
    if (file) {
      setEstimate(null);
      setEstimateError(null);
      setEstimating(true);
    }
  }

  async function onRun() {
    if (!file) return;
    const out = await pickSavePath({
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
      [file]
    ).catch(() => {});
  }

  return (
    <ToolPage title={t("tools.optimize")} description={t("tools:optimize.description")}>
      <FileDropzone onFiles={selectFile} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      {file && (
        <div className="min-h-10 text-sm" aria-live="polite">
          {estimating && (
            <div className="flex items-center gap-2 text-[var(--color-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{t("tools:optimize.estimate_loading")}</span>
            </div>
          )}
          {estimateError && (
            <p className="text-[var(--color-danger)]">
              {t("tools:optimize.estimate_error", { error: estimateError })}
            </p>
          )}
          {estimate && !estimating && (
            <div>
              <p>
                {t("tools:optimize.estimate_summary", {
                  current: formatBytes(estimate.current_bytes),
                  estimated: formatBytes(estimate.estimated_bytes),
                  percent: estimatePercent(estimate),
                })}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {t("tools:optimize.estimate_difference", {
                  difference: formatBytes(
                    Math.abs(estimate.current_bytes - estimate.estimated_bytes),
                  ),
                })}{" "}
                {estimate.method === "dry_run"
                  ? t("tools:optimize.estimate_method_dry_run")
                  : t("tools:optimize.estimate_method_heuristic")}
              </p>
            </div>
          )}
        </div>
      )}
      <OptimizeOptions value={opts} onChange={changeOptions} mode="standalone" />
      <div className="flex gap-2">
        <Button disabled={!file || !!activeId} onClick={onRun}>
          {t("tools:optimize.run")}
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
