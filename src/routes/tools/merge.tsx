import { createFileRoute } from "@tanstack/react-router";
import { MergeTool } from "@/components/tools/MergeTool";

export const Route = createFileRoute("/tools/merge")({ component: MergeTool });
