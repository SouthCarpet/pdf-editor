// Phase 14 Task 75 — Pipeline Editor canvas.
//
// Three columns:
//   left   = NodePalette (Phase 14)
//   center = xyflow canvas (this file)
//   right  = NodeConfigPanel when a node is selected
//
// Top-right toolbar covers run/save/load preset.
import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type ReactFlowInstance,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { NodePalette } from "./NodePalette";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { PipelineNodeView } from "./PipelineNodeView";
import { PipelineRunDialog } from "./PipelineRunDialog";
import { PipelinePresetBar } from "./PipelinePresetBar";
import { WarningEdge } from "./WarningEdge";
import {
  usePipelineStore,
  type PipelineEditorNode,
} from "@/stores/pipelineStore";
import { nodeKindByKey, type NodeKindMeta } from "@/pipeline/nodeKinds";
import { computeEdgeWarnings } from "@/pipeline/preservation";

const NODE_TYPES = {
  pipeline_node: PipelineNodeView,
} as const;

const EDGE_TYPES = {
  preservation: WarningEdge,
} as const;

export function PipelineEditor() {
  return (
    <ReactFlowProvider>
      <InnerEditor />
    </ReactFlowProvider>
  );
}

function InnerEditor() {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const setSelected = usePipelineStore((s) => s.setSelected);
  const applyNodeChangesAction = usePipelineStore((s) => s.applyNodeChanges);
  const applyEdgeChangesAction = usePipelineStore((s) => s.applyEdgeChanges);
  const connectAction = usePipelineStore((s) => s.connect);
  const addNodeAction = usePipelineStore((s) => s.addNode);

  const [showRun, setShowRun] = useState(false);
  // Holds the xyflow instance once it mounts so we can use coordinate
  // helpers if we add drag-from-palette later.
  const [, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChangesAction(changes);
      const sel = changes.find(
        (c) => c.type === "select",
      ) as Extract<NodeChange, { type: "select" }> | undefined;
      if (sel && sel.selected) setSelected(sel.id);
      if (sel && !sel.selected) {
        if (selectedNodeId === sel.id) setSelected(null);
      }
    },
    [applyNodeChangesAction, setSelected, selectedNodeId],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => applyEdgeChangesAction(changes),
    [applyEdgeChangesAction],
  );

  const onConnect = useCallback<OnConnect>(
    (connection: Connection) => connectAction(connection),
    [connectAction],
  );

  function handleAddNode(kind: NodeKindMeta) {
    const id = crypto.randomUUID();
    const offset = nodes.length;
    addNodeAction({
      id,
      type: "pipeline_node",
      position: { x: 120 + offset * 28, y: 80 + offset * 56 },
      data: {
        kind: kind.key,
        config: kind.defaultPayload(),
        label: kind.label,
      },
    });
  }

  const selectedNode: PipelineEditorNode | undefined = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  // Compute label live for the selected node so the canvas badge updates.
  const liveNodes = useMemo<PipelineEditorNode[]>(
    () =>
      nodes.map((n) => {
        const meta = nodeKindByKey(n.data.kind);
        return {
          ...n,
          data: { ...n.data, label: meta.label },
        };
      }),
    [nodes],
  );

  // Delta Y: compute edge warnings client-side and decorate each edge
  // with the matching `data.warnings` array so the custom WarningEdge
  // renders an inline alert badge on conflicting transitions.
  const liveEdges = useMemo(() => {
    const warnings = computeEdgeWarnings(
      nodes.map((n) => ({ id: n.id, config: n.data.config })),
      edges.map((e) => ({ source: e.source, target: e.target })),
    );
    const byKey = new Map(
      warnings.map((w) => [`${w.from}->${w.to}`, w.artifacts]),
    );
    return edges.map((e) => {
      const key = `${e.source}->${e.target}`;
      const w = byKey.get(key);
      return {
        ...e,
        type: "preservation" as const,
        data: { ...(e.data ?? {}), warnings: w ?? [] },
      };
    });
  }, [nodes, edges]);

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[220px_1fr_320px]">
      <NodePalette onAdd={handleAddNode} />
      <div className="relative">
        <ReactFlow
          nodes={liveNodes}
          edges={liveEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setRfInstance}
          onPaneClick={() => setSelected(null)}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <div className="absolute right-3 top-3 flex gap-2">
          <PipelinePresetBar />
          <Button onClick={() => setShowRun(true)} disabled={nodes.length === 0}>
            Run
          </Button>
        </div>
        <PipelineRunDialog open={showRun} onClose={() => setShowRun(false)} />
      </div>
      {selectedNode ? (
        <NodeConfigPanel node={selectedNode} />
      ) : (
        <div className="border-l border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm text-[var(--color-muted)]">
          Select a node to edit its configuration. Drag from the palette to
          add nodes, then connect them top-to-bottom.
        </div>
      )}
    </div>
  );
}
