// Tool picker top bar — placed at the top of the Workspace and lets the
// user flip between the "workspace tools" (Edit / Organize / Crop /
// Extract / Compare). Form-style tools (Merge, Split, Compress, ...) live
// in their own routes under /tools and don't belong here.
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWorkspace, type WorkspaceTool } from "@/stores/workspaceStore";

const TOOLS: WorkspaceTool[] = ["edit", "organize", "crop", "extract", "ocr", "compare"];

export function WorkspaceTopBar() {
  const { t } = useTranslation("common");
  const tool = useWorkspace((s) => s.activeTool);
  const setTool = useWorkspace((s) => s.setTool);

  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1">
      {TOOLS.map((id) => (
        <Button
          key={id}
          variant={id === tool ? "default" : "ghost"}
          size="sm"
          onClick={() => setTool(id)}
        >
          {t(`tools.${id}`)}
        </Button>
      ))}
    </div>
  );
}
