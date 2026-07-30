// Phase 14 Task 77 — Pipeline run dialog.
//
// Two modes: "Run on files" (multi-select PDFs) and "Run on folder"
// (folder picker). Both build the pipeline JSON from the current
// editor store, register a job_id, open a tauri::ipc::Channel for
// progress events, and stream them into the in-dialog progress UI.
//
// The dialog shows:
//   - per-file rows with status (queued / running / ok / failed)
//   - the live progress bar from the executor's per-node updates
//   - the Delta Y preflight warnings the report carries
//   - a final summary with success / failed counts
//   - "Open output folder" if any output was written
import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Channel } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import {
  computeEdgeWarnings,
  artifactLabel,
} from "@/pipeline/preservation";

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
        setError(`cancel failed: ${String(e)}`);
      }
    }
  }

  function makeChannel(): Channel<PipelineProgressEvent> {
    const ch = new Channel<PipelineProgressEvent>();
    ch.onmessage = (ev) => {
      if (ev.type === "started") {
        setProgress({ ratio: 0, label: ev.label ?? "starting" });
      } else if (ev.type === "progress") {
        setProgress({ ratio: ev.ratio ?? 0, label: ev.label ?? "" });
      } else if (ev.type === "done") {
        setProgress({ ratio: 1, label: ev.message ?? "done" });
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
    setRows([{ path: dir, status: "running", message: "scanning folder" }]);
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
      // Folder mode — show one row per output + one per error
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
      .catch(() => setError("Failed to copy path to clipboard"));
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

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
      <div className="flex h-[80vh] w-[640px] flex-col gap-3 rounded-md bg-[var(--color-card)] p-4 text-[var(--color-foreground)] shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Run pipeline</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={running}
          >
            Close
          </Button>
        </div>

        {warnings.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <strong>Preservation warnings ({warnings.length})</strong>:
            <ul className="ml-4 list-disc">
              {warnings.map((w) => (
                <li key={`${w.from}->${w.to}`}>
                  {w.from} -&gt; {w.to}: may strip{" "}
                  {w.artifacts.map(artifactLabel).join(", ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          {hasOpenFileNode ? (
            <Button
              onClick={runConfiguredFiles}
              disabled={running || configuredOpenFilePaths.length === 0}
            >
              {t("open_file.run_selected")}
            </Button>
          ) : (
            <>
              <Button
                onClick={runOnFiles}
                disabled={running || nodes.length === 0}
              >
                Run on files
              </Button>
              <Button
                onClick={runOnFolder}
                disabled={running || nodes.length === 0}
              >
                Run on folder
              </Button>
            </>
          )}
          {running && jobId && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>

        {progress && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded bg-neutral-200">
              <div
                className="h-2 rounded bg-blue-500 transition-all"
                style={{ width: `${Math.round(progress.ratio * 100)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-muted)]">{progress.label}</p>
          </div>
        )}

        {error && (
          <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-1 text-left">File</th>
                <th className="p-1 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="p-2 text-center text-[var(--color-muted)]">
                    {hasOpenFileNode
                      ? t("open_file.run_hint")
                      : "Pick files or a folder to start."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.path}-${i}`} className="border-t">
                    <td className="max-w-[400px] truncate p-1" title={r.path}>
                      {r.path}
                    </td>
                    <td className="p-1">
                      <StatusBadge state={r.status} />
                      {r.message && (
                        <span className="ml-2 text-[var(--color-muted)]">
                          {r.message}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {report && (
          <div className="flex items-center justify-between text-xs">
            <p>
              <span className="text-green-700">{report.success} ok</span>
              {" / "}
              <span className="text-red-700">{report.failed} failed</span>
              {" / "}
              <span>{report.output_paths.length} outputs</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={openOutput}
              disabled={report.output_paths.length === 0}
            >
              Open output folder
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: RowState["status"] }) {
  const cls = {
    queued: "bg-neutral-200 text-neutral-700",
    running: "bg-blue-100 text-blue-700",
    ok: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  }[state];
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{state}</span>;
}
