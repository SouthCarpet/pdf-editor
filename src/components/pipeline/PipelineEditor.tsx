// Phase 14 Task 75: Pipeline Editor canvas.
//
// Three columns:
//   left   = NodePalette (Phase 14)
//   center = xyflow canvas (this file)
//   right  = NodeConfigPanel when a node is selected
//
// Top-right toolbar covers run/save/load preset.
//
// Kaliber r4 (plan 119 K3b): the graph is a data screen (R34 b). The canvas is
// the lead element, on the well colour; panels sit on the sheet with one
// hairline. xyflow reads its colours from --xy-* custom properties, so every
// one of them is set here from a Kaliber token. No shadow, no own colour.
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
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
import { usePipelineStore, type PipelineEditorNode } from "@/stores/pipelineStore";
import { nodeKindByKey, type NodeKindMeta } from "@/pipeline/nodeKinds";
import { computeEdgeWarnings } from "@/pipeline/preservation";
import { selectedNodeAfterChanges } from "@/pipeline/selection";

const FLOW_STYLE = {
  "--xy-background-color": "var(--color-well)",
  "--xy-background-pattern-color": "var(--color-border)",
  "--xy-edge-stroke": "var(--color-text-muted)",
  "--xy-edge-stroke-selected": "var(--color-accent)",
  "--xy-connectionline-stroke": "var(--color-accent)",
  "--xy-handle-background-color": "var(--color-surface-raised)",
  "--xy-handle-border-color": "var(--color-text-muted)",
  "--xy-node-background-color": "var(--color-surface-raised)",
  "--xy-node-color": "var(--color-text)",
  "--xy-node-border": "1px solid var(--color-border-strong)",
  "--xy-node-boxshadow-hover": "none",
  "--xy-node-boxshadow-selected": "none",
  "--xy-controls-box-shadow": "none",
  "--xy-controls-button-background-color": "var(--color-surface-raised)",
  "--xy-controls-button-background-color-hover": "var(--color-surface-hover)",
  "--xy-controls-button-border-color": "var(--color-border)",
  "--xy-controls-button-color": "var(--color-text)",
  "--xy-controls-button-color-hover": "var(--color-text)",
  "--xy-minimap-background-color": "var(--color-surface-raised)",
  "--xy-minimap-mask-background-color": "color-mix(in oklab, var(--color-background) 70%, transparent)",
  "--xy-minimap-node-background-color": "var(--color-border-strong)",
  "--xy-edge-label-background-color": "var(--color-surface-raised)",
  "--xy-edge-label-color": "var(--color-text)",
  "--xy-attribution-background-color": "var(--color-surface-raised)",
} as CSSProperties;

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
  const { t } = useTranslation("pipeline");
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
      // Switching steps arrives as ONE batch holding the deselect of the old
      // node and the select of the new one, deselect first. Taking the first
      // select-change picked the deselect, cleared the selection and blanked
      // the config panel; clicking the same node again emitted nothing at all
      // (xyflow skips a node it already considers selected), so the panel
      // stayed blank while the node looked selected. Read the whole batch:
      // a node being selected always wins over anything being deselected.
      setSelected(selectedNodeAfterChanges(changes, selectedNodeId));
    },
    [applyNodeChangesAction, setSelected, selectedNodeId]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => applyEdgeChangesAction(changes),
    [applyEdgeChangesAction]
  );

  const onConnect = useCallback<OnConnect>(
    (connection: Connection) => connectAction(connection),
    [connectAction]
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
    setSelected(id);
  }

  const selectedNode: PipelineEditorNode | undefined = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
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
    [nodes]
  );

  // Delta Y: compute edge warnings client-side and decorate each edge
  // with the matching `data.warnings` array so the custom WarningEdge
  // renders an inline alert badge on conflicting transitions.
  const liveEdges = useMemo(() => {
    const warnings = computeEdgeWarnings(
      nodes.map((n) => ({ id: n.id, config: n.data.config })),
      edges.map((e) => ({ source: e.source, target: e.target }))
    );
    const byKey = new Map(warnings.map((w) => [`${w.from}->${w.to}`, w.artifacts]));
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
          style={FLOW_STYLE}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <div className="absolute top-3 right-3 flex gap-2">
          <PipelinePresetBar />
          <Button onClick={() => setShowRun(true)} disabled={nodes.length === 0}>
            {t("run")}
          </Button>
        </div>
        <PipelineRunDialog open={showRun} onClose={() => setShowRun(false)} />
      </div>
      {selectedNode ? (
        <NodeConfigPanel node={selectedNode} />
      ) : (
        <div className="k-caption border-l border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
          {t("editor.selection_hint")}
        </div>
      )}
    </div>
  );
}
