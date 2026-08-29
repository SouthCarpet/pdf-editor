// Regression tests for pipeline step selection (plan 011).
//
// The requirement is that steps "remain selectable/addable later in the flow".
// Two defects broke that and neither was caught, because there were no tests
// over this store or the editor at all.
import { describe, it, expect, beforeEach } from "vitest";
import type { NodeChange } from "@xyflow/react";
import {
  usePipelineStore,
  type PipelineEditorNode,
} from "@/stores/pipelineStore";
import { selectedNodeAfterChanges } from "@/pipeline/selection";

function node(id: string): PipelineEditorNode {
  return {
    id,
    type: "pipeline_node",
    position: { x: 0, y: 0 },
    data: { kind: "merge", config: { kind: "merge" }, label: id },
  } as PipelineEditorNode;
}

describe("pipeline step selection", () => {
  beforeEach(() => {
    usePipelineStore.getState().reset();
  });

  it("switches to the newly selected node when one batch carries both a deselect and a select", () => {
    // This is the exact shape xyflow emits when the user clicks node B while
    // node A is selected: the deselect comes FIRST. Reading only the first
    // select-change picked the deselect, cleared the selection, and blanked
    // the config panel while B sat visibly highlighted.
    const changes: NodeChange[] = [
      { type: "select", id: "a", selected: false },
      { type: "select", id: "b", selected: true },
    ];

    expect(selectedNodeAfterChanges(changes, "a")).toBe("b");
  });

  it("clears the selection when the selected node is deselected and nothing else is selected", () => {
    const changes: NodeChange[] = [
      { type: "select", id: "a", selected: false },
    ];

    expect(selectedNodeAfterChanges(changes, "a")).toBeNull();
  });

  it("leaves the selection alone when the deselect targets some other node", () => {
    const changes: NodeChange[] = [
      { type: "select", id: "b", selected: false },
    ];

    expect(selectedNodeAfterChanges(changes, "a")).toBe("a");
  });

  it("adding a node selects it and deselects every other node", () => {
    // Store selection and xyflow's own `selected` flag must agree. When they
    // did not, the canvas highlighted the old node while the panel edited the
    // new one, and clicking the highlighted node was a dead click: xyflow
    // emits no change for a node it already considers selected.
    const store = usePipelineStore.getState();
    store.addNode(node("a"));
    store.addNode(node("b"));

    const nodes = usePipelineStore.getState().nodes;
    expect(nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(nodes.find((n) => n.id === "a")?.selected).toBe(false);
    expect(nodes.find((n) => n.id === "b")?.selected).toBe(true);
    expect(nodes.filter((n) => n.selected)).toHaveLength(1);
  });

  it("keeps existing edges untouched when a step is added mid-flow", () => {
    const store = usePipelineStore.getState();
    store.addNode(node("a"));
    store.addNode(node("b"));
    store.connect({
      source: "a",
      target: "b",
      sourceHandle: null,
      targetHandle: null,
    });

    const before = usePipelineStore.getState().edges;
    usePipelineStore.getState().addNode(node("c"));
    const after = usePipelineStore.getState().edges;

    expect(after).toEqual(before);
    expect(usePipelineStore.getState().nodes).toHaveLength(3);
  });
});
