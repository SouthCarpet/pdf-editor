// Tool picker + document-level actions top bar - placed at the top of the
// Workspace. Two groups share the row:
//   - the workspace tools (Edit / Organize / Crop / Extract / OCR /
//     Compare) - form-style tools (Merge, Split, Compress, ...) live in
//     their own routes under /tools and don't belong here.
//   - plan 060 task T1 (R2/R3): global Save / Save as for the active
//     document, a shortcut into the Convert tool, an overflow for the
//     other document-level tools, and the zoom indicator (R1).
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Minus, Plus, Redo2, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastAction, toast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace, ZOOM_DEFAULT, type WorkspaceTool } from "@/stores/workspaceStore";
import { useHasUnsavedWork } from "@/lib/unsavedWork";
import { saveDocument } from "@/lib/documentSave";
import { EMPTY_DOCUMENT_HISTORY, historyStore } from "@/stores/historyStore";
import { useDocuments } from "@/stores/documentStore";
import { revealSavedFile } from "@/tauri/bridge";
import { parsePageInput } from "./pageNavigation";
import { PrintDialog } from "./PrintDialog";
import {
  WORKSPACE_PRINT_REQUEST_EVENT,
  type WorkspacePrintRequestDetail,
} from "./printRequest";

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

function historyEntryText(t: ReturnType<typeof useTranslation>["t"], label: string): string {
  switch (label) {
    case "add":
      return t("workspace:history.entries.add");
    case "text":
      return t("workspace:history.entries.text");
    case "style":
      return t("workspace:history.entries.style");
    case "move":
      return t("workspace:history.entries.move");
    case "resize":
      return t("workspace:history.entries.resize");
    case "delete":
      return t("workspace:history.entries.delete");
    case "edit":
      return t("workspace:history.entries.edit");
    case "organize":
      return t("workspace:history.entries.organize");
    case "crop":
      return t("workspace:history.entries.crop");
    default:
      return label;
  }
}

interface Props {
  /** Absolute path of the document currently open in the workspace. */
  path: string;
  pageCount?: number;
  activePage?: number;
  onSelectPage?: (pageIndex: number) => void;
  onOpenSearch?: () => void;
  onOpenShortcuts?: () => void;
}

interface PageBoxProps {
  activePage: number;
  pageCount: number;
  onSelectPage: (pageIndex: number) => void;
}

function PageBox({ activePage, pageCount, onSelectPage }: PageBoxProps) {
  const { t } = useTranslation("workspace");
  const [draft, setDraft] = useState(String(activePage + 1));

  function commit() {
    const page = parsePageInput(draft, pageCount);
    if (page === null) {
      setDraft(String(activePage + 1));
      return;
    }
    setDraft(String(page));
    onSelectPage(page - 1);
  }

  return (
    <div className="mr-2 flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-control)] px-2 text-xs tabular-nums text-[var(--color-muted)]">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        aria-label={t("navigation.page_input")}
        disabled={pageCount < 1}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-8 bg-transparent text-right tabular-nums text-[var(--color-foreground)] focus-visible:outline-none"
      />
      <span aria-hidden="true" className="px-1">/</span>
      <span>{pageCount}</span>
    </div>
  );
}

export function WorkspaceTopBar({
  path,
  pageCount: pageCountProp,
  activePage: activePageProp,
  onSelectPage,
  onOpenSearch,
  onOpenShortcuts,
}: Props) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const tool = useWorkspace((s) => s.activeTool);
  const setTool = useWorkspace((s) => s.setTool);
  const zoom = useWorkspace((s) => s.zoomByDoc[path] ?? ZOOM_DEFAULT);
  const zoomIn = useWorkspace((s) => s.zoomIn);
  const zoomOut = useWorkspace((s) => s.zoomOut);
  const resetZoom = useWorkspace((s) => s.resetZoom);
  const zoomMode = useWorkspace((s) => s.zoomModeByDoc[path] ?? "custom");
  const setZoomMode = useWorkspace((s) => s.setZoomMode);
  const storedActivePage = useWorkspace((s) => s.activePage);
  const setStoredActivePage = useWorkspace((s) => s.setActivePage);
  const storedPageCount = useDocuments((s) => s.documents.get(path)?.pageCount ?? 0);
  const hasDocument = useDocuments((s) => path.length > 0 && s.documents.has(path));
  const activePage = activePageProp ?? storedActivePage;
  const pageCount = pageCountProp ?? storedPageCount;
  const canSave = useHasUnsavedWork(path);
  const history = useStore(historyStore, (state) => state.byDoc[path] ?? EMPTY_DOCUMENT_HISTORY);
  const undoEntry = history.undo.at(-1);
  const redoEntry = history.redo.at(-1);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printHint, setPrintHint] = useState(false);
  const toolLabels: Record<WorkspaceTool, string> = {
    edit: t("common:tools.edit"),
    organize: t("common:tools.organize"),
    crop: t("common:tools.crop"),
    extract: t("common:tools.extract"),
    ocr: t("common:tools.ocr"),
    compare: t("common:tools.compare"),
  };
  const undoTitle = undoEntry
    ? t("workspace:history.undo_with_label", {
        label: historyEntryText(t, undoEntry.label),
      })
    : t("workspace:history.undo");
  const redoTitle = redoEntry
    ? t("workspace:history.redo_with_label", {
        label: historyEntryText(t, redoEntry.label),
      })
    : t("workspace:history.redo");

  async function onSave() {
    setBusy(true);
    setHint(false);
    try {
      const outcome = await saveDocument(path);
      if (outcome === "nothing-to-save") setHint(true);
      if (outcome === "saved") showSavedToast();
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
      if (outcome === "saved") showSavedToast();
    } finally {
      setBusy(false);
    }
  }

  function showSavedToast() {
    const savedPath = useDocuments.getState().documents.get(path)?.savedPath;
    if (!savedPath) return;
    toast({
      title: t("workspace:save_toast.saved"),
      action: (
        <ToastAction altText={t("workspace:save_toast.reveal")} onClick={() => void revealSavedFile(savedPath)}>
          {t("workspace:save_toast.reveal")}
        </ToastAction>
      ),
    });
  }

  function selectTool(nextTool: WorkspaceTool) {
    setTool(nextTool);
    if (nextTool !== "compare") return;
    void navigate({
      to: "/workspace/$docId",
      params: { docId: encodeURIComponent(path) },
      search: { tool: "compare" },
    });
  }

  useEffect(() => {
    function onPrintRequest(event: Event) {
      const { docId } = (event as CustomEvent<WorkspacePrintRequestDetail>).detail;
      if (docId !== path) return;
      if (!hasDocument) {
        setPrintHint(true);
        return;
      }
      setPrintHint(false);
      setPrintOpen(true);
    }
    window.addEventListener(WORKSPACE_PRINT_REQUEST_EVENT, onPrintRequest);
    return () => window.removeEventListener(WORKSPACE_PRINT_REQUEST_EVENT, onPrintRequest);
  }, [hasDocument, path]);

  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1">
      {TOOLS.map((id) => (
        <Button
          key={id}
          variant={id === tool ? "default" : "ghost"}
          size="sm"
          onClick={() => selectTool(id)}
        >
          {toolLabels[id]}
        </Button>
      ))}

      <div aria-hidden="true" className="mx-1 h-6 w-px bg-[var(--color-border)]" />

      <Button
        size="sm"
        variant="ghost"
        className="h-10"
        title={undoTitle}
        disabled={undoEntry === undefined}
        onClick={() => historyStore.getState().undo(path)}
      >
        <Undo2 className="mr-1 size-4" aria-hidden="true" />
        {t("workspace:history.undo")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-10"
        title={redoTitle}
        disabled={redoEntry === undefined}
        onClick={() => historyStore.getState().redo(path)}
      >
        <Redo2 className="mr-1 size-4" aria-hidden="true" />
        {t("workspace:history.redo")}
      </Button>

      <Button size="sm" variant="ghost" disabled={!canSave || busy} onClick={() => void onSave()}>
        {t("save")}
      </Button>
      <Button size="sm" variant="ghost" disabled={!canSave || busy} onClick={() => void onSaveAs()}>
        {t("save_as")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!hasDocument || busy}
        onClick={() => {
          setPrintHint(false);
          setPrintOpen(true);
        }}
      >
        {t("workspace:print.action")}
      </Button>
      <PrintDialog
        open={printOpen}
        path={path}
        pageCount={pageCount}
        disabled={!hasDocument}
        onOpenChange={setPrintOpen}
      />
      {hint && (
        <span role="status" className="text-xs text-[var(--color-muted)]">
          {t("workspace:close_guard.text_draft_hint")}
        </span>
      )}
      {printHint && (
        <span role="status" className="text-xs text-[var(--color-muted)]">
          {t("workspace:print.no_document")}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenShortcuts}>
            {t("workspace:shortcuts.open_shortcuts")}
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-1">
        {onOpenSearch && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 w-10 p-0 active:scale-[0.96] transition-transform"
            aria-label={t("workspace:search.open")}
            onClick={onOpenSearch}
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
        )}
        <PageBox
          key={activePage}
          activePage={activePage}
          pageCount={pageCount}
          onSelectPage={onSelectPage ?? setStoredActivePage}
        />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10 w-8 p-0"
              aria-label={t("workspace:toolbar.zoom_modes")}
            >
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setZoomMode(path, "fit-width")}>
              <Check
                className={zoomMode === "fit-width" ? "mr-2 size-4" : "mr-2 size-4 opacity-0"}
                aria-hidden="true"
              />
              {t("workspace:toolbar.fit_width")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setZoomMode(path, "fit-page")}>
              <Check
                className={zoomMode === "fit-page" ? "mr-2 size-4" : "mr-2 size-4 opacity-0"}
                aria-hidden="true"
              />
              {t("workspace:toolbar.fit_page")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
