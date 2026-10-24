import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import i18n from "@/i18n";
import { PipelineNodeView } from "../PipelineNodeView";
import { nodeKindByKey } from "@/pipeline/nodeKinds";
import type { PipelineEditorNode } from "@/stores/pipelineStore";

function renderNode(selected: boolean) {
  const meta = nodeKindByKey("merge");
  const props = {
    id: "n1",
    data: { kind: "merge", config: meta.defaultPayload(), label: meta.label },
    selected,
  } as unknown as NodeProps<PipelineEditorNode>;
  return render(
    <ReactFlowProvider>
      <PipelineNodeView {...props} />
    </ReactFlowProvider>,
  );
}

describe("PipelineNodeView colours", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("draws a selected node from tokens with a bold label and no shadow or Tailwind palette colour", () => {
    const { container } = renderNode(true);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border-[var(--color-accent)]");
    expect(card.className).toContain("bg-[var(--color-surface-selected)]");
    expect(card.className).not.toMatch(/shadow|blue-|amber-/);
    expect(screen.getByText("Merge")).toHaveClass("font-bold");
  });

  it("draws an unselected node on the sheet with a regular-weight label", () => {
    const { container } = renderNode(false);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-[var(--color-surface-raised)]");
    expect(card.className).not.toMatch(/shadow|blue-/);
    expect(screen.getByText("Merge")).toHaveClass("font-semibold");
  });
});
