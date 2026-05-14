import { createFileRoute } from "@tanstack/react-router";
import { PipelineEditor } from "@/components/pipeline/PipelineEditor";

export const Route = createFileRoute("/pipeline")({
  component: PipelineEditor,
});
