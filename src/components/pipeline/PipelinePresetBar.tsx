// Phase 14 Task 76 — preset bar (save / load / delete).
//
// Hooked up to commands.pipelinePreset{Create,List,Get,Update,Delete}.
// The "Save" button opens a small dialog (name + optional description).
// The "Load" dropdown lists all presets; clicking one replaces the
// current draft. The "Delete" button (within the load menu) prompts
// before deleting.
import { useEffect, useState } from "react";
import type { Edge } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type PipelinePreset } from "@/bindings";
import {
  usePipelineStore,
  type PipelineEditorNode,
} from "@/stores/pipelineStore";
import { nodeKindByKey } from "@/pipeline/nodeKinds";

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
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const loadGraph = usePipelineStore((s) => s.loadGraph);

  const [presets, setPresets] = useState<PipelinePreset[]>([]);
  const [open, setOpen] = useState<"none" | "save" | "load">("none");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Name is required");
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
        }),
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
      setError(`Failed to load preset: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p: PipelinePreset) {
    if (!confirm(`Delete preset "${p.name}"? This cannot be undone.`)) return;
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
          Load preset
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(open === "save" ? "none" : "save")}
          disabled={nodes.length === 0}
        >
          Save preset
        </Button>
      </div>
      {open === "save" && (
        <div className="z-20 w-80 space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-lg">
          <Input
            placeholder="Preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen("none")}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      )}
      {open === "load" && (
        <div className="z-20 w-96 max-h-96 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-lg">
          {presets.length === 0 ? (
            <p className="p-2 text-xs text-[var(--color-muted)]">
              No saved presets yet.
            </p>
          ) : (
            presets.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-2 rounded p-2 hover:bg-neutral-100"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-[var(--color-muted)]">
                      {p.description}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLoad(p)}
                    disabled={busy}
                  >
                    Load
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(p)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
          {error && <p className="px-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
