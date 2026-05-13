import { createFileRoute } from "@tanstack/react-router";
import { SplitTool } from "@/components/tools/SplitTool";

export const Route = createFileRoute("/tools/split")({ component: SplitTool });
