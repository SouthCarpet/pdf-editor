// Tool picker + document-level actions top bar - placed at the top of the
// Workspace. Two groups share the row:
//   - the workspace tools (Edit / Organize / Crop / Extract / OCR /
//     Compare) - form-style tools (Merge, Split, Compress, ...) live in
//     their own routes under /tools and don't belong here.
//   - plan 060 task T1 (R2/R3): global Save / Save as for the active
//     document, a shortcut into the Convert tool, an overflow for the
//     other document-level tools, and the zoom indicator (R1).
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace, ZOOM_DEFAULT, type WorkspaceTool } from "@/stores/workspaceStore";
import { useHasUnsavedWork } from "@/lib/unsavedWork";
import { saveDocument } from "@/lib/documentSave";

const TOOLS: WorkspaceTool[] = ["edit", "organize", "crop", "extract", "ocr", "compare"];

// Document-level tools that live at their own route, not a workspace tab.
// Convert gets its own button (named in the brief); the rest sit in the
// overflow so the row stays readable.
const OVERFLOW_TOOLS = [
  { key: "compress", to: "/tools/compress" },
  { key: "merge", to: "/tools/merge" },
  { key: "split", to: "/tools/split" },
  { key: "optimize", to: "/tools/optimize" },
  { key: "unlock", to: "/tools/unlock" },
] as const;

interface Props {
  /** Absolute path of the document currently open in the workspace. */
  path: string;
}

export function WorkspaceTopBar({ path }: Props) {
  const { t } = useTranslation("common");
  const tool = useWorkspace((s) => s.activeTool);
  const setTool = useWorkspace((s) => s.setTool);
  const zoom = useWorkspace((s) => s.zoomByDoc[path] ?? ZOOM_DEFAULT);
  const zoomIn = useWorkspace((s) => s.zoomIn);
  const zoomOut = useWorkspace((s) => s.zoomOut);
  const resetZoom = useWorkspace((s) => s.resetZoom);
  const canSave = useHasUnsavedWork(path);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);

  async function onSave() {
    setBusy(true);
    setHint(false);
    try {
      const outcome = await saveDocument(path);
      if (outcome === "nothing-to-save") setHint(true);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAs() {
    setBusy(true);
    setHint(false);
    try {
      const outcome = await saveDocument(path, { forcePrompt: true });
      if (outcome === "nothing-to-save") setHint(true);
    } finally {
      setBusy(false);
    }
  }

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

      <div aria-hidden="true" className="mx-1 h-6 w-px bg-[var(--color-border)]" />

      <Button size="sm" variant="ghost" disabled={!canSave || busy} onClick={() => void onSave()}>
        {t("save")}
      </Button>
      <Button size="sm" variant="ghost" disabled={!canSave || busy} onClick={() => void onSaveAs()}>
        {t("save_as")}
      </Button>
      {hint && (
        <span role="status" className="text-xs text-[var(--color-muted)]">
          {t("workspace:close_guard.text_draft_hint")}
        </span>
      )}

      <Link
        to="/tools/convert/export"
        search={{ file: path }}
        className="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-control-hover)]"
      >
        {t("workspace:toolbar.convert")}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            {t("workspace:toolbar.more_tools")}
            <ChevronDown className="ml-1 size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {OVERFLOW_TOOLS.map(({ key, to }) => (
            <DropdownMenuItem key={key} asChild>
              {/* `to` iterates a plain string array; see `ToolTile.tsx`
                  for the same cast against the generated route union. */}
              <Link to={to as never}>{t(`tools.${key}`)}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="w-8 px-0"
          aria-label={t("workspace:zoom_out")}
          onClick={() => zoomOut(path)}
        >
          <Minus className="size-4" aria-hidden="true" />
        </Button>
        <button
          type="button"
          className="min-w-12 rounded-md px-1 text-center text-xs tabular-nums text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
          title={t("workspace:toolbar.zoom_reset")}
          onClick={() => resetZoom(path)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          size="sm"
          variant="ghost"
          className="w-8 px-0"
          aria-label={t("workspace:zoom_in")}
          onClick={() => zoomIn(path)}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
