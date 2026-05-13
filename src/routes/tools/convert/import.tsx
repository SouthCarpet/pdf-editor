import { createFileRoute } from "@tanstack/react-router";
import { ConvertImportTool } from "@/components/tools/ConvertImportTool";

export const Route = createFileRoute("/tools/convert/import")({
  component: ConvertImportTool,
});
