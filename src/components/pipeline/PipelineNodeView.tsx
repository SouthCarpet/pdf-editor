// Phase 14 Task 75: Custom xyflow node renderer.
//
// One renderer for every NodeKind. Renders the label + a one-line summary
// of the current config. Connection handles are top (target) and bottom
// (source) so the canvas reads vertically. Save lives at the bottom.
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
      className={`min-w-[180px] rounded-md border-2 bg-[var(--color-card)] p-2 text-xs shadow-sm ${
        selected ? "border-blue-500" : "border-[var(--color-border)] hover:border-blue-300"
      }`}
    >
      {data.kind !== "open_file" && <Handle type="target" position={Position.Top} />}
      <div className="font-semibold">{translateNodeLabel(t, data.kind)}</div>
      <div className="mt-1 truncate text-[var(--color-muted)]">
        {meta.summary(data.config) || "(default config)"}
      </div>
      {data.kind !== "save" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
