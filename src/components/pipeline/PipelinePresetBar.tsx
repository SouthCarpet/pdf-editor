// Phase 14 Task 76: preset bar (save / load / delete).
//
// Hooked up to commands.pipelinePreset{Create,List,Get,Update,Delete}.
// The "Save" button opens a small dialog (name + optional description).
// The "Load" dropdown lists all presets; clicking one replaces the
// current draft. The "Delete" button (within the load menu) prompts
// before deleting.
//
// Kaliber r4 (plan 119 K3b): the two panels sit on the sheet with a hairline
// and no shadow, fields carry a permanent label, and deleting asks in a dialog
// that names the preset and its step count (R14) instead of the native confirm.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Edge } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type PipelinePreset } from "@/bindings";
import { usePipelineStore, type PipelineEditorNode } from "@/stores/pipelineStore";
import { nodeKindByKey } from "@/pipeline/nodeKinds";
import { ConfirmDeleteDialog } from "@/components/projects/ConfirmDeleteDialog";
import { useCountLabels } from "@/components/projects/useCountLabels";

interface DraftGraph {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: PipelineEditorNode["data"];
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

function unwrap<T>(r: { status: "ok"; data: T } | { status: "error"; error: unknown }): T {
  if (r.status === "ok") return r.data;
  const msg = (() => {
    try {
      return JSON.stringify(r.error);
    } catch {
      return String(r.error);
    }
  })();
  throw new Error(msg);
}

export function PipelinePresetBar() {
  const { t } = useTranslation("pipeline");
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const loadGraph = usePipelineStore((s) => s.loadGraph);

  const [presets, setPresets] = useState<PipelinePreset[]>([]);
  const [open, setOpen] = useState<"none" | "save" | "load">("none");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PipelinePreset | null>(null);
  const counts = useCountLabels();

  async function refresh() {
    try {
      const list = unwrap(await commands.pipelinePresetList());
      setPresets(list);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    // The lint rule flags any direct setState reachable from the effect
    // body. Queue the load on a microtask so it lands after the render
    // commit and out of the cascading-render zone.
    void Promise.resolve().then(() => {
      void refresh();
    });
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      setError(t("preset_name_required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const graph: DraftGraph = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type ?? "pipeline_node",
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        })),
      };
      await unwrap(
        await commands.pipelinePresetCreate({
          name: name.trim(),
          description: description.trim() || null,
          graph_json: JSON.stringify(graph),
        })
      );
      setName("");
      setDescription("");
      setOpen("none");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleLoad(p: PipelinePreset) {
    setBusy(true);
    setError(null);
    try {
      const parsed: DraftGraph = JSON.parse(p.graph_json);
      // Rebuild the editor nodes with their stored config + label.
      const loadedNodes: PipelineEditorNode[] = parsed.nodes.map((n) => ({
        id: n.id,
        type: "pipeline_node",
        position: n.position,
        data: {
          ...n.data,
          label: nodeKindByKey(n.data.kind).label,
        },
      }));
      const loadedEdges: Edge[] = parsed.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));
      loadGraph(loadedNodes, loadedEdges);
      setOpen("none");
    } catch (e) {
      setError(t("preset_load_failed", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p: PipelinePreset) {
    setPendingDelete(null);
    setBusy(true);
    setError(null);
    try {
      await unwrap(await commands.pipelinePresetDelete(p.id));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(open === "load" ? "none" : "load")}
        >
          {t("load_preset")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(open === "save" ? "none" : "save")}
          disabled={nodes.length === 0}
        >
          {t("save_preset")}
        </Button>
      </div>
      {open === "save" && (
        <SavePanel
          name={name}
          description={description}
          error={error}
          busy={busy}
          onName={setName}
          onDescription={setDescription}
          onCancel={() => setOpen("none")}
          onSave={handleSave}
        />
      )}
      {open === "load" && (
        <LoadPanel
          presets={presets}
          error={error}
          busy={busy}
          onLoad={handleLoad}
          onDelete={setPendingDelete}
        />
      )}
      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        title={t("preset_delete_title", { name: pendingDelete?.name ?? "" })}
        body={t("preset_delete_body", {
          steps: counts.steps(pendingDelete ? stepCount(pendingDelete) : 0),
        })}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/** Number of steps (nodes) in a stored preset; 0 when the graph cannot be read. */
function stepCount(preset: PipelinePreset): number {
  try {
    return (JSON.parse(preset.graph_json) as DraftGraph).nodes.length;
  } catch {
    return 0;
  }
}

const PANEL = "z-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)]";

interface SavePanelProps {
  name: string;
  description: string;
  error: string | null;
  busy: boolean;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

function SavePanel(props: SavePanelProps) {
  const { t } = useTranslation("pipeline");
  return (
    <div className={`${PANEL} w-80 space-y-3 p-3`}>
      <label className="k-field-block">
        <span className="k-label">{t("preset_name")}</span>
        <Input value={props.name} onChange={(e) => props.onName(e.target.value)} />
      </label>
      <label className="k-field-block">
        <span className="k-label">{t("preset_description")}</span>
        <Input value={props.description} onChange={(e) => props.onDescription(e.target.value)} />
      </label>
      {props.error && <p className="k-field-msg text-xs">{props.error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={props.onCancel} disabled={props.busy}>
          {t("common:cancel")}
        </Button>
        <Button size="sm" onClick={props.onSave} disabled={props.busy}>
          {t("common:save")}
        </Button>
      </div>
    </div>
  );
}

interface LoadPanelProps {
  presets: PipelinePreset[];
  error: string | null;
  busy: boolean;
  onLoad: (preset: PipelinePreset) => void;
  onDelete: (preset: PipelinePreset) => void;
}

function LoadPanel({ presets, error, busy, onLoad, onDelete }: LoadPanelProps) {
  const { t } = useTranslation("pipeline");
  return (
    <div className={`${PANEL} max-h-96 w-96 space-y-1 overflow-y-auto p-2`}>
      {presets.length === 0 ? (
        <p className="k-caption p-2">{t("preset_empty")}</p>
      ) : (
        presets.map((p) => (
          <div
            key={p.id}
            className="flex items-start justify-between gap-2 rounded p-2 hover:bg-[var(--color-surface-hover)]"
          >
            <div className="flex-1">
              <div className="text-sm font-medium">{p.name}</div>
              {p.description && <div className="k-caption">{p.description}</div>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onLoad(p)} disabled={busy}>
                {t("load_preset")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(p)} disabled={busy}>
                {t("common:delete")}
              </Button>
            </div>
          </div>
        ))
      )}
      {error && <p className="k-field-msg px-2 text-xs">{error}</p>}
    </div>
  );
}
