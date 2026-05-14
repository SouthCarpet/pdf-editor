import { createFileRoute } from "@tanstack/react-router";
import { ProjectList } from "@/components/projects/ProjectList";

export const Route = createFileRoute("/projects/")({ component: ProjectList });
