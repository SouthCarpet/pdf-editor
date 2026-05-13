import { createFileRoute } from "@tanstack/react-router";
import { UnlockTool } from "@/components/tools/UnlockTool";

export const Route = createFileRoute("/tools/unlock")({ component: UnlockTool });
