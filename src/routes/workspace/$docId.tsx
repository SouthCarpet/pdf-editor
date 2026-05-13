import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceRoute } from "@/components/workspace/WorkspaceRoute";

export const Route = createFileRoute("/workspace/$docId")({
  component: WorkspaceRoute,
});
