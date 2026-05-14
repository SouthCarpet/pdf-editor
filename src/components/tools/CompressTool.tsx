import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { commands, type CompressionPresetDto } from "@/bindings";
import { useJobsStore } from "@/stores/jobsStore";
import {
  CompressOptions,
  DEFAULT_COMPRESS_OPTIONS,
  type CompressOptionsValue,
} from "./options/CompressOptions";

interface RunStats {
  before: number;
  after: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// Compress uses the typed binding directly rather than `useToolJob` because
// the success payload (before/after byte counts) is meaningful — `useToolJob`
// discards it. Progress is still represented via the jobs store so the
// dashboard / progress list can show the run.
export function CompressTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [options, setOptions] = useState<CompressOptionsValue>(
    DEFAULT_COMPRESS_OPTIONS,
  );
  const [stats, setStats] = useState<RunStats | null>(null);
  const [running, setRunning] = useState(false);
  const { start, finish, fail } = useJobsStore();

  async function onRun() {
    if (!file) return;
    const out = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "compressed.pdf",
    });
    if (!out) return;
    setStats(null);
    setRunning(true);
    const id = crypto.randomUUID();
    start(id, "compress", [file]);
    try {
      // The Rust compress_pdf_cmd currently accepts only the named preset;
      // the Custom path falls back to "recommended" until Phase 17 wires
      // the custom_quality / custom_dpi knobs through GhostscriptWrapper.
      const presetToSend: CompressionPresetDto =
        options.preset === "custom" ? "recommended" : options.preset;
      const res = await commands.compressPdfCmd({
        input: file,
        output: out,
        preset: presetToSend,
        job_id: id,
      });
      if (res.status === "ok") {
        setStats({ before: res.data.before_bytes, after: res.data.after_bytes });
        finish(id, res.data.output_paths);
      } else {
        const err = res.error as { key?: string; data?: { detail?: string } };
        fail(id, err.key ?? "internal", err.data?.detail);
      }
    } catch (e) {
      fail(id, "internal", e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <ToolPage
      title={t("tools.compress")}
      description="Reduce PDF size with Ghostscript."
    >
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <CompressOptions value={options} onChange={setOptions} mode="standalone" />
      <div className="flex gap-2">
        <Button disabled={!file || running} onClick={onRun}>
          {t("ok")}
        </Button>
      </div>
      {stats && (
        <div className="rounded border p-3 text-sm">
          <div>Before: {formatBytes(stats.before)}</div>
          <div>After: {formatBytes(stats.after)}</div>
          <div>
            Saved:{" "}
            {stats.before > 0
              ? `${(((stats.before - stats.after) / stats.before) * 100).toFixed(1)}%`
              : "-"}
          </div>
        </div>
      )}
      <ProgressList />
    </ToolPage>
  );
}
