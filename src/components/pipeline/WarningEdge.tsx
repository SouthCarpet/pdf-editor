// Phase 14 Task 75 - Delta Y warning edge, Kaliber r4 (plan 119 K3b).
//
// Custom xyflow edge component. Draws the default bezier line, then
// overlays a small caution badge in the middle when the edge's
// `data.warnings` array (computed live by the editor via
// `computeEdgeWarnings`) is non-empty. Hovering the badge surfaces the
// list of artifacts the downstream node will silently drop.
// The line and badge use the warning token; the badge has no shadow.
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Artifact } from "@/pipeline/preservation";
import { useArtifactNames } from "./useArtifactNames";

interface WarningEdgeData {
  warnings?: Artifact[];
  [key: string]: unknown;
}

export function WarningEdge(props: EdgeProps) {
  const { t } = useTranslation("pipeline");
  const artifactNames = useArtifactNames();
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
          stroke: hasWarning ? "var(--color-warning)" : style?.stroke,
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
            className="rounded-full bg-[var(--color-warning-soft)] p-1 text-[var(--color-text)] ring-1 ring-[var(--color-warning)]"
            title={t("edge_title", { artifacts: artifactNames(warnings) })}
          >
            <AlertTriangle size={14} aria-hidden="true" />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
