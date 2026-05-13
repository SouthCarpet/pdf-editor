import { createFileRoute } from "@tanstack/react-router";
import { ExtractTool } from "@/components/tools/ExtractTool";

export const Route = createFileRoute("/tools/extract")({ component: ExtractTool });
