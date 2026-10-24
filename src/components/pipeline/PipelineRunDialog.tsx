// Phase 14 Task 77 - Pipeline run dialog.
//
// Two modes: "Run on files" (multi-select PDFs) and "Run on folder"
// (folder picker). Both build the pipeline JSON from the current
// editor store, register a job_id, open a tauri::ipc::Channel for
// progress events, and stream them into the in-dialog progress UI.
//
// Kaliber r4 (plan 119 K3b): a modal Dialog on the shared ui/dialog, a
// determinate k-progress bar, one k-alert for preflight warnings, and a ruled
// results table whose state is a mark plus a word (R28), not a coloured pill.
//
// The dialog shows:
//   - per-file rows with status (queued / running / ok / failed)
//   - the live progress bar from the executor's per-node updates
//   - the Delta Y preflight warnings the report carries
//   - a final summary with success / failed counts
//   - "Open output folder" if any output was written
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Channel } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  commands,
  type PipelineRunReport,
  type PipelineProgressEvent,
  type Pipeline,
  type NodeKind,
} from "@/bindings";
import {
  usePipelineStore,
  type PipelineEditorNode,
} from "@/stores/pipelineStore";
import { payloadToRust } from "@/pipeline/nodeKinds";
import { computeEdgeWarnings } from "@/pipeline/preservation";
import { translateNodeLabel } from "@/pipeline/nodeLabels";
import { useArtifactNames } from "./useArtifactNames";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface RowState {
  path: string;
  status: "queued" | "running" | "ok" | "failed";
  message?: string;
}

function buildPipelinePayload(
  nodes: PipelineEditorNode[],
  edges: { source: string; target: string }[],
): Pipeline {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      // payloadToRust emits the discriminated-union shape Tauri expects;
      // the strict bindings type is enforced server-side via serde tags.
      kind: payloadToRust(n.data.config) as unknown as NodeKind,
    })),
    edges: edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

export function PipelineRunDialog({ open: isOpen, onClose }: Props) {
  const { t } = useTranslation("pipeline");
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);

  const [rows, setRows] = useState<RowState[]>([]);
  const [report, setReport] = useState<PipelineRunReport | null>(null);
  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const warnings = useMemo(
    () =>
      computeEdgeWarnings(
        nodes.map((n) => ({ id: n.id, config: n.data.config })),
        edges.map((e) => ({ source: e.source, target: e.target })),
      ),
    [nodes, edges],
  );
  const hasOpenFileNode = nodes.some(
    (node) => node.data.config.kind === "open_file",
  );
  const configuredOpenFilePaths = useMemo(
    () =>
      Array.from(
        new Set(
          nodes.flatMap((node) =>
            node.data.config.kind === "open_file"
              ? node.data.config.paths
              : [],
          ),
        ),
      ),
    [nodes],
  );

  function reset() {
    setRows([]);
    setReport(null);
    setProgress(null);
    setError(null);
    setJobId(null);
  }

  const handleClose = useCallback(() => {
    if (running) return;
    reset();
    onClose();
  }, [running, onClose]);

  async function handleCancel() {
    if (jobId) {
      try {
        await commands.cancelJob(jobId);
      } catch (e) {
        // best-effort; surface the error inline
        setError(t("cancel_failed", { error: String(e) }));
      }
    }
  }

  function makeChannel(): Channel<PipelineProgressEvent> {
    const ch = new Channel<PipelineProgressEvent>();
    ch.onmessage = (ev) => {
      if (ev.type === "started") {
        setProgress({ ratio: 0, label: ev.label ?? t("progress_start") });
      } else if (ev.type === "progress") {
        setProgress({ ratio: ev.ratio ?? 0, label: ev.label ?? "" });
      } else if (ev.type === "done") {
        setProgress({ ratio: 1, label: ev.message ?? t("progress_done") });
      } else if (ev.type === "error") {
        setError(`${ev.key}: ${ev.detail ?? ""}`);
      }
    };
    return ch;
  }

  function unwrap<T>(
    r: { status: "ok"; data: T } | { status: "error"; error: unknown },
  ): T {
    if (r.status === "ok") return r.data;
    throw new Error(JSON.stringify(r.error));
  }

  async function runOnFiles() {
    const chosen = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!chosen) return;
    const paths = Array.isArray(chosen) ? chosen : [chosen];
    if (paths.length === 0) return;
    await runWithFiles(paths);
  }

  async function runWithFiles(paths: string[]) {
    reset();
    setRunning(true);
    const id = crypto.randomUUID();
    setJobId(id);
    setRows(paths.map((p) => ({ path: p, status: "running" })));
    try {
      const r = unwrap(
        await commands.pipelineRunCmd(
          {
            pipeline: buildPipelinePayload(nodes, edges),
            inputs: paths,
            job_id: id,
          },
          makeChannel(),
        ),
      );
      applyReport(r, paths);
    } catch (e) {
      setError(String(e));
      setRows((rs) => rs.map((r) => ({ ...r, status: "failed" })));
    } finally {
      setRunning(false);
    }
  }

  async function runConfiguredFiles() {
    if (configuredOpenFilePaths.length === 0) return;
    await runWithFiles(configuredOpenFilePaths);
  }

  async function runOnFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (!dir || Array.isArray(dir)) return;
    reset();
    setRunning(true);
    const id = crypto.randomUUID();
    setJobId(id);
    setRows([{ path: dir, status: "running", message: t("scanning_folder") }]);
    try {
      const r = unwrap(
        await commands.pipelineRunOnFolderCmd(
          {
            pipeline: buildPipelinePayload(nodes, edges),
            folder: dir,
            job_id: id,
          },
          makeChannel(),
        ),
      );
      applyReport(r, []);
    } catch (e) {
      setError(String(e));
      setRows([{ path: dir, status: "failed", message: String(e) }]);
    } finally {
      setRunning(false);
    }
  }

  function applyReport(r: PipelineRunReport, inputs: string[]) {
    setReport(r);
    const byInput = new Map(r.errors.map((e) => [e.input, e.message]));
    if (inputs.length > 0) {
      setRows(
        inputs.map((p) => ({
          path: p,
          status: byInput.has(p) ? "failed" : "ok",
          message: byInput.get(p),
        })),
      );
    } else {
      // Folder mode - show one row per output + one per error
      const okRows: RowState[] = r.output_paths.map((p) => ({
        path: p,
        status: "ok",
      }));
      const errRows: RowState[] = r.errors.map((e) => ({
        path: e.input,
        status: "failed",
        message: e.message,
      }));
      setRows([...okRows, ...errRows]);
    }
  }

  function openOutput() {
    if (!report || report.output_paths.length === 0) return;
    // Reveal-in-folder support lands when @tauri-apps/plugin-opener is
    // added; until then we copy the first output path to clipboard as a
    // pragmatic stand-in so the user can paste into Explorer.
    const first = report.output_paths[0];
    navigator.clipboard
      .writeText(first)
      .catch(() => setError(t("copy_failed")));
  }

  useEffect(() => {
    if (!isOpen) {
      // Defer the reset out of the effect's render-flush phase so React's
      // strict cascading-render rule does not fire. Calling setState
      // *synchronously* during an effect is the lint trigger; queueing
      // via Promise.resolve runs after the render commits.
      void Promise.resolve().then(reset);
    }
  }, [isOpen]);

  const labelOf = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    return node ? translateNodeLabel(t, node.data.kind) : id;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent closeLabel={t("common:close")} className="flex h-[80vh] max-w-[640px] flex-col">
        <DialogHeader>
          <DialogTitle>{t("run_dialog_title")}</DialogTitle>
        </DialogHeader>

        <WarningsBlock warnings={warnings} labelOf={labelOf} />

        <RunActions
          configured={hasOpenFileNode}
          configuredCount={configuredOpenFilePaths.length}
          hasNodes={nodes.length > 0}
          running={running}
          cancellable={running && jobId !== null}
          onConfigured={runConfiguredFiles}
          onFiles={runOnFiles}
          onFolder={runOnFolder}
          onCancel={handleCancel}
        />

        {progress && <ProgressBlock ratio={progress.ratio} label={progress.label} />}

        {error && (
          <div className="k-alert k-alert--error">
            <span className="k-mark k-mark--error k-alert-icon" aria-hidden="true" />
            <p className="k-alert-body">{error}</p>
          </div>
        )}

        <ResultsTable rows={rows} hint={hasOpenFileNode ? t("open_file.run_hint") : t("pick_hint")} />

        {report && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="tabular-nums">
              {t("summary", {
                ok: report.success,
                failed: report.failed,
                outputs: report.output_paths.length,
              })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={openOutput}
              disabled={report.output_paths.length === 0}
            >
              {t("copy_output")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProgressBlock({ ratio, label }: { ratio: number; label: string }) {
  const { t } = useTranslation("pipeline");
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={label || t("run_dialog_title")}
        className="k-progress"
      >
        <span className="k-progress-fill" style={{ "--k-value": ratio } as CSSProperties} />
      </div>
      <p className="k-caption">{label}</p>
    </div>
  );
}

function WarningsBlock({
  warnings,
  labelOf,
}: {
  warnings: ReturnType<typeof computeEdgeWarnings>;
  labelOf: (id: string) => string;
}) {
  const { t } = useTranslation("pipeline");
  const artifactNames = useArtifactNames();
  if (warnings.length === 0) return null;
  return (
    <div className="k-alert k-alert--warning">
      <span className="k-mark k-mark--error k-alert-icon" aria-hidden="true" />
      <div className="k-alert-body">
        <p className="font-medium">{t("preflight_warnings")}</p>
        <ul className="ml-4 list-disc">
          {warnings.map((w) => (
            <li key={`${w.from}->${w.to}`}>
              {t("edge_strips", {
                from: labelOf(w.from),
                to: labelOf(w.to),
                artifacts: artifactNames(w.artifacts),
              })}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ResultsTable({ rows, hint }: { rows: RowState[]; hint: string }) {
  const { t } = useTranslation("pipeline");
  return (
    <div className="k-table-wrap min-h-0 flex-1 overflow-y-auto">
      <table className="k-table">
        <thead>
          <tr>
            <th scope="col">{t("table.file")}</th>
            <th scope="col">{t("table.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="k-caption">
                {hint}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={`${r.path}-${i}`}>
                <td className="max-w-[400px] truncate" title={r.path}>
                  {r.path}
                </td>
                <td>
                  <StatusMark state={r.status} />
                  {r.message && <span className="k-caption ml-2">{r.message}</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// A state is a mark shape plus a word; colour only supports it (R28).
const MARK: Record<RowState["status"], string> = {
  queued: "k-mark",
  running: "k-mark k-mark--half",
  ok: "k-mark k-mark--full",
  failed: "k-mark k-mark--error",
};

function StatusMark({ state }: { state: RowState["status"] }) {
  const { t } = useTranslation("pipeline");
  const label = {
    queued: t("status.queued"),
    running: t("status.running"),
    ok: t("status.ok"),
    failed: t("status.failed"),
  }[state];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={MARK[state]} aria-hidden="true" />
      {label}
    </span>
  );
}

interface RunActionsProps {
  configured: boolean;
  configuredCount: number;
  hasNodes: boolean;
  running: boolean;
  cancellable: boolean;
  onConfigured: () => void;
  onFiles: () => void;
  onFolder: () => void;
  onCancel: () => void;
}

function RunActions(props: RunActionsProps) {
  const { t } = useTranslation("pipeline");
  return (
    <div className="flex gap-2">
      {props.configured ? (
        <Button
          onClick={props.onConfigured}
          disabled={props.running || props.configuredCount === 0}
        >
          {t("open_file.run_selected")}
        </Button>
      ) : (
        <>
          <Button onClick={props.onFiles} disabled={props.running || !props.hasNodes}>
            {t("run_on_files")}
          </Button>
          <Button onClick={props.onFolder} disabled={props.running || !props.hasNodes}>
            {t("run_on_folder")}
          </Button>
        </>
      )}
      {props.cancellable && (
        <Button variant="outline" onClick={props.onCancel}>
          {t("common:cancel")}
        </Button>
      )}
    </div>
  );
}
