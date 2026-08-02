// Phase 14 Task 75 - Delta Y warning edge.
//
// Custom xyflow edge component. Draws the default bezier line, then
// overlays a small caution badge in the middle when the edge's
// `data.warnings` array (computed live by the editor via
// `computeEdgeWarnings`) is non-empty. Hovering the badge surfaces the
// list of artifacts the downstream node will silently drop.
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { artifactLabel, type Artifact } from "@/pipeline/preservation";

interface WarningEdgeData {
  warnings?: Artifact[];
  [key: string]: unknown;
}

export function WarningEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
  } = props;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const warnings = (data as WarningEdgeData | undefined)?.warnings ?? [];
  const hasWarning = warnings.length > 0;
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: hasWarning ? "#d97706" : style?.stroke,
          strokeWidth: hasWarning ? 2 : style?.strokeWidth,
        }}
      />
      {hasWarning && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="rounded-full bg-[var(--color-warning-soft)] p-1 text-[var(--color-warning-soft-foreground)] ring-1 ring-[var(--color-warning)] shadow"
            title={`Downstream will strip: ${warnings
              .map(artifactLabel)
              .join(", ")}`}
          >
            <AlertTriangle size={14} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
