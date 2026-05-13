import { createFileRoute } from "@tanstack/react-router";
import { ConvertExportTool } from "@/components/tools/ConvertExportTool";

export const Route = createFileRoute("/tools/convert/export")({
  component: ConvertExportTool,
});
