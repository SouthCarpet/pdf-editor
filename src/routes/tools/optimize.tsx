import { createFileRoute } from "@tanstack/react-router";
import { OptimizeTool } from "@/components/tools/OptimizeTool";

export const Route = createFileRoute("/tools/optimize")({ component: OptimizeTool });
