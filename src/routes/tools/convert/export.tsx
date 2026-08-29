import { createFileRoute } from "@tanstack/react-router";
import { ConvertExportTool } from "@/components/tools/ConvertExportTool";

export interface ConvertExportSearch {
  /** Plan 060 task T1 (R3): the workspace toolbar's "Konvertovať" button
   * passes the active document here, so the tool opens pre-loaded instead
   * of making the user pick the same file again. */
  file?: string;
}

export const Route = createFileRoute("/tools/convert/export")({
  component: ConvertExportTool,
  validateSearch: (search: Record<string, unknown>): ConvertExportSearch => {
    const { file } = search;
    return typeof file === "string" ? { file } : {};
  },
});
