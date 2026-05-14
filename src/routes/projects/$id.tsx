import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailRoute } from "@/components/projects/ProjectDetailRoute";

export const Route = createFileRoute("/projects/$id")({
  component: ProjectDetailRoute,
});
