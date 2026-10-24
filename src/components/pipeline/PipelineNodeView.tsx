// Phase 14 Task 75: Custom xyflow node renderer, Kaliber r4 (plan 119 K3b).
//
// One renderer for every NodeKind. Renders the label + a one-line summary
// of the current config. Connection handles are top (target) and bottom
// (source) so the canvas reads vertically. Save lives at the bottom.
// Colours are tokens only. A selected node has three cues and no shadow: the
// accent frame, the selected fill and the bold label.
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import type { PipelineEditorNode } from "@/stores/pipelineStore";
import { nodeKindByKey } from "@/pipeline/nodeKinds";
import { translateNodeLabel } from "@/pipeline/nodeLabels";

export function PipelineNodeView({ data, selected }: NodeProps<PipelineEditorNode>) {
  const { t } = useTranslation("pipeline");
  const meta = nodeKindByKey(data.kind);
  return (
    <div
      className={`min-w-[180px] rounded-md border p-2 text-xs ${
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-surface-selected)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      {data.kind !== "open_file" && <Handle type="target" position={Position.Top} />}
      <div className={selected ? "font-bold" : "font-semibold"}>
        {translateNodeLabel(t, data.kind)}
      </div>
      <div className="mt-1 truncate text-[var(--color-text-muted)]">
        {meta.summary(data.config) || t("default_config")}
      </div>
      {data.kind !== "save" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
