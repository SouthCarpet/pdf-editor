// Phase 14 Task 75 - Pipeline editor store.
//
// Holds the draft pipeline (nodes + edges + selected node) being assembled
// in `/pipeline`. The store exposes mutations that match @xyflow/react's
// node/edge change-set callbacks so the editor can be a thin shell over
// the canonical state.
import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";

import type { NodeKindKey, NodeKindPayload } from "@/pipeline/nodeKinds";

// xyflow Node generic - `data` is our NodeKind payload + label string.
export interface PipelineNodeData extends Record<string, unknown> {
  kind: NodeKindKey;
  config: NodeKindPayload;
  label: string;
}

export type PipelineEditorNode = Node<PipelineNodeData>;

interface PipelineState {
  nodes: PipelineEditorNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  setNodes: (next: PipelineEditorNode[]) => void;
  setEdges: (next: Edge[]) => void;
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  connect: (connection: Connection) => void;
  addNode: (node: PipelineEditorNode) => void;
  patchNodeConfig: (id: string, patch: Partial<NodeKindPayload>) => void;
  setNodeConfig: (id: string, config: NodeKindPayload) => void;
  removeNode: (id: string) => void;
  setSelected: (id: string | null) => void;
  loadGraph: (nodes: PipelineEditorNode[], edges: Edge[]) => void;
  reset: () => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  setNodes: (next) => set({ nodes: next }),
  setEdges: (next) => set({ edges: next }),
  applyNodeChanges: (changes) =>
    set({
      nodes: applyNodeChanges(changes, get().nodes) as PipelineEditorNode[],
    }),
  applyEdgeChanges: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),
  connect: (connection) =>
    set({ edges: addEdge(connection, get().edges) }),
  // The new node arrives already selected and every other node is cleared, so
  // xyflow's own `selected` flags and `selectedNodeId` cannot disagree. When
  // they disagreed, the canvas highlighted the previous node while the config
  // panel edited the new one, and clicking the highlighted node did nothing:
  // xyflow skips emitting a change for a node it already considers selected.
  addNode: (node) =>
    set({
      nodes: [
        ...get().nodes.map((n) =>
          n.selected ? { ...n, selected: false } : n,
        ),
        { ...node, selected: true },
      ],
    }),
  patchNodeConfig: (id, patch) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                config: { ...n.data.config, ...patch } as NodeKindPayload,
              },
            }
          : n,
      ),
    }),
  setNodeConfig: (id, config) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config } } : n,
      ),
    }),
  removeNode: (id) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    }),
  setSelected: (id) => set({ selectedNodeId: id }),
  loadGraph: (nodes, edges) =>
    set({ nodes, edges, selectedNodeId: null }),
  reset: () => set({ nodes: [], edges: [], selectedNodeId: null }),
}));
