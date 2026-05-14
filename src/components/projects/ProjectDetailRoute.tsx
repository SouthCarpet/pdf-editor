// Thin wrapper that resolves the URL `id` param and forwards it to
// ProjectDetail. Kept in its own file so the route file under
// src/routes/projects/$id.tsx exports only the `Route` constant (matches
// the project's react-refresh/only-export-components convention).
import { useParams } from "@tanstack/react-router";
import { ProjectDetail } from "./ProjectDetail";

export function ProjectDetailRoute() {
  const { id } = useParams({ from: "/projects/$id" });
  return <ProjectDetail projectId={Number(id)} />;
}
