import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceRoute } from "@/components/workspace/WorkspaceRoute";
import type { WorkspaceTool } from "@/stores/workspaceStore";

export interface WorkspaceSearch {
  tool?: WorkspaceTool;
}

export const Route = createFileRoute("/workspace/$docId")({
  component: WorkspaceRoute,
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => {
    const t = search.tool;
    if (
      t === "edit" ||
      t === "organize" ||
      t === "crop" ||
      t === "extract" ||
      t === "compare"
    ) {
      return { tool: t };
    }
    return {};
  },
});
