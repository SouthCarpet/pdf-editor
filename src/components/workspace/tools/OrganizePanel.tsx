// Phase 11 Task 63 / plan 062 T5.1 — Organize panel.
//
// Grid of page thumbnails with group drag-and-drop, Shift-range / Ctrl-toggle
// selection, reverse, duplicate, insert-from-PDF, and per-page rotate / delete
// / insert-blank / keyboard move. Staging lives in organizeModel; Apply flushes
// the plan (reorder → extract/merge imports → blanks → rotate) then
// historyStore.clear (T2.2: Apply drops the document history).
import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import type * as pdfjs from "pdfjs-dist";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";
import { cn } from "@/lib/utils";
import { historyStore } from "@/stores/historyStore";
import { useOrganizeStore } from "@/stores/organizeStore";
import { pickPaths, pickSavePath } from "@/tauri/bridge";
import { PdfViewer } from "../PdfViewer";
import { parsePageRanges } from "./extractSelection";
import {
  buildApplyPlan,
  createOrganizeState,
  deleteSelected,
  dragGroupIds,
  duplicate,
  insertBlankAfter,
  insertFrom,
  isOrganizeDirty,
  mergeImportSplit,
  movePages,
  reverse,
  rotatePage,
  selectOne,
  selectRange,
  toggleDeleted,
  toggleSelect,
  type OrganizeState,
} from "./organizeModel";

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  docPath: string;
}

const PDF_FILTER = [{ name: "PDF", extensions: ["pdf"] }];

export function OrganizePanel({ pdf, docPath }: Props) {
  const { t } = useTranslation(["common", "tools"]);
  // Staged plan lives in `organizeStore`, not local state (plan 062 final
  // fix wave F4). The panel unmounts on a tool switch and remounts later;
  // the store outlives it, so an undo/redo pushed while the panel was open
  // still applies once the panel is gone.
  const storedBundle = useOrganizeStore((s) => s.byDoc[docPath]);
  const org =
    storedBundle !== undefined && storedBundle.pdf === pdf
      ? storedBundle.org
      : createOrganizeState(pdf.numPages);

  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    path: string;
    pageCount: number;
  } | null>(null);
  const [rangeText, setRangeText] = useState("1");

  const dirty = useMemo(
    () => isOrganizeDirty(org, pdf.numPages),
    [org, pdf.numPages],
  );

  function setOrg(next: OrganizeState) {
    useOrganizeStore.getState().setOrg(docPath, pdf, next);
  }

  function commit(next: OrganizeState) {
    if (next === org) return;
    const before = org;
    setOrg(next);
    if (next.pages === before.pages && next.nextId === before.nextId) return;
    historyStore.getState().push(docPath, {
      label: "organize",
      undo: () => useOrganizeStore.getState().setOrg(docPath, pdf, before),
      redo: () => useOrganizeStore.getState().setOrg(docPath, pdf, next),
    });
  }

  function onCardClick(event: MouseEvent, id: string) {
    if (event.shiftKey) {
      event.preventDefault();
      commit(selectRange(org, org.anchorId ?? id, id));
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      commit(toggleSelect(org, id));
      return;
    }
    commit(selectOne(org, id));
  }

  function onDragStart(event: DragEvent, id: string) {
    const group = dragGroupIds(org, id);
    setDragIds(group);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", group.join(","));
    if (group.length > 1) {
      const ghost = document.createElement("div");
      ghost.textContent = t("organize.drag_count", { ns: "tools", count: group.length });
      ghost.style.position = "absolute";
      ghost.style.top = "-1000px";
      ghost.style.padding = "4px 8px";
      ghost.style.background = "var(--color-surface-raised)";
      ghost.style.border = "1px solid var(--color-border)";
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 16, 16);
      requestAnimationFrame(() => ghost.remove());
    }
  }

  function onDrop(targetId: string) {
    if (dragIds === null || dragIds.length === 0) {
      setDragIds(null);
      return;
    }
    const targetIndex = org.pages.findIndex((page) => page.id === targetId);
    if (targetIndex >= 0) commit(movePages(org, dragIds, targetIndex));
    setDragIds(null);
  }

  function moveUp(index: number) {
    const page = org.pages[index];
    if (!page || index === 0) return;
    commit(movePages(org, [page.id], index - 1));
  }
  function moveDown(index: number) {
    const page = org.pages[index];
    if (!page || index >= org.pages.length - 1) return;
    commit(movePages(org, [page.id], index + 2));
  }

  function duplicateSelected() {
    let next = org;
    for (const id of org.pages
      .filter((page) => org.selectedIds.includes(page.id))
      .map((page) => page.id)
      .reverse()) {
      next = duplicate(next, id);
    }
    commit(next);
  }

  async function pickImport() {
    const selected = await pickPaths({
      multiple: false,
      directory: false,
      filters: PDF_FILTER,
    });
    const path = selected[0];
    if (!path) return;
    const opened = await commands.openDocument(path);
    const pageCount = opened.status === "ok" ? opened.data.page_count : 1;
    setPendingImport({ path, pageCount });
    setRangeText("1");
  }

  function confirmImport() {
    if (!pendingImport) return;
    const indices = [...parsePageRanges(rangeText, pendingImport.pageCount)].sort(
      (a, b) => a - b,
    );
    if (indices.length === 0) return;
    const selectedIndexes = org.selectedIds
      .map((id) => org.pages.findIndex((page) => page.id === id))
      .filter((index) => index >= 0);
    const afterIndex =
      selectedIndexes.length > 0
        ? Math.max(...selectedIndexes)
        : org.pages.length - 1;
    commit(
      insertFrom(
        org,
        afterIndex,
        indices.map((page) => ({
          imported: { path: pendingImport.path, page },
        })),
      ),
    );
    setPendingImport(null);
  }

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const out = await pickSavePath({
        defaultPath: docPath.replace(/\.pdf$/i, ".organized.pdf"),
        filters: PDF_FILTER,
      });
      if (!out) {
        setBusy(false);
        return;
      }

      const plan = buildApplyPlan(org);
      let current = docPath;
      let pageCount = pdf.numPages;
      let hasCurrent = false;
      let pendingExtract: { path: string; count: number } | null = null;
      let stageN = 0;
      const nextStage = (label: string) => {
        stageN += 1;
        return `${out}.stage${stageN}_${label}.pdf`;
      };

      const fail = (result: { status: "error"; error: { key: string; data: unknown } }) => {
        setErr(
          t(`errors:${result.error.key}`, {
            ...((result.error.data as Record<string, unknown> | null) ?? {}),
            defaultValue: result.error.key,
          }),
        );
        return false;
      };

      async function applyMerge(afterPageIndex: number): Promise<boolean> {
        const extracted = pendingExtract;
        if (!extracted) return true;
        if (!hasCurrent || pageCount === 0) {
          current = extracted.path;
          pageCount = extracted.count;
          hasCurrent = true;
          pendingExtract = null;
          return true;
        }
        const dest = nextStage("merge");
        const split = mergeImportSplit(afterPageIndex, pageCount);
        let inputs: string[];
        if (split.mode === "prepend") {
          inputs = [extracted.path, current];
        } else if (split.mode === "append") {
          inputs = [current, extracted.path];
        } else {
          const prefixPath = nextStage("prefix");
          const suffixPath = nextStage("suffix");
          const prefix = await commands.extractPagesCmd({
            input: current,
            pages: split.prefix,
            output: prefixPath,
            job_id: crypto.randomUUID(),
          });
          if (prefix.status === "error") {
            fail(prefix);
            return false;
          }
          const suffix = await commands.extractPagesCmd({
            input: current,
            pages: split.suffix,
            output: suffixPath,
            job_id: crypto.randomUUID(),
          });
          if (suffix.status === "error") {
            fail(suffix);
            return false;
          }
          inputs = [prefixPath, extracted.path, suffixPath];
        }
        const merged = await commands.mergePdfsCmd({
          inputs,
          output: dest,
          job_id: crypto.randomUUID(),
        });
        if (merged.status === "error") {
          fail(merged);
          return false;
        }
        current = dest;
        pageCount += extracted.count;
        pendingExtract = null;

        return true;
      }

      async function applyStage(stage: (typeof plan.stages)[number]): Promise<boolean> {
        if (stage.type === "reorder") {
          const dest = nextStage("reorder");
          const result = await commands.reorderPagesCmd({
            input: current,
            output: dest,
            new_order: stage.new_order,
            job_id: crypto.randomUUID(),
          });
          if (result.status === "error") {
            fail(result);
            return false;
          }
          current = dest;
          pageCount = stage.new_order.length;
          hasCurrent = true;
        } else if (stage.type === "extract_import") {
          const dest = nextStage("extract");
          const result = await commands.extractPagesCmd({
            input: stage.input,
            pages: stage.pages,
            output: dest,
            job_id: crypto.randomUUID(),
          });
          if (result.status === "error") {
            fail(result);
            return false;
          }
          pendingExtract = { path: dest, count: stage.pages.length };
        } else if (stage.type === "merge_import") {
          return applyMerge(stage.after_page_index);
        } else if (stage.type === "insert_blank") {
          const dest = nextStage("blank");
          const result = await commands.insertBlankPageCmd({
            input: current,
            output: dest,
            after_page_index: stage.after_page_index,
            width: stage.width,
            height: stage.height,
            job_id: crypto.randomUUID(),
          });
          if (result.status === "error") {
            fail(result);
            return false;
          }
          current = dest;
          pageCount += 1;
          hasCurrent = true;
        } else if (stage.type === "rotate") {
          const dest = nextStage("rotate");
          const result = await commands.rotatePagesCmd({
            input: current,
            output: dest,
            rotations: stage.rotations,
            job_id: crypto.randomUUID(),
          });
          if (result.status === "error") {
            fail(result);
            return false;
          }
          current = dest;
        }

        return true;
      }

      for (const stage of plan.stages) {
        if (!await applyStage(stage)) return;
      }

      const saved = await commands.saveDocument(current, out);
      if (saved.status === "error") {
        setErr(
          t(`errors:${saved.error.key}`, {
            ...((saved.error.data as Record<string, unknown> | null) ?? {}),
            defaultValue: saved.error.key,
          }),
        );
      } else {
        historyStore.getState().clear(docPath);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.organize")}</h3>
      <p className="text-xs text-[var(--color-text-muted)]">
        {t("organize.hint", { ns: "tools" })}
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          onClick={() => commit(reverse(org))}
          disabled={org.pages.length < 2}
        >
          {t("organize.reverse", { ns: "tools" })}
        </Button>
        <Button
          variant="outline"
          onClick={duplicateSelected}
          disabled={org.selectedIds.length === 0}
        >
          {t("organize.duplicate", { ns: "tools" })}
        </Button>
        <Button variant="outline" onClick={() => void pickImport()}>
          {t("organize.insert_from_pdf", { ns: "tools" })}
        </Button>
        <Button
          variant="outline"
          onClick={() => commit(deleteSelected(org))}
          disabled={org.selectedIds.length === 0}
        >
          {t("organize.delete_selected", { ns: "tools" })}
        </Button>
      </div>
      {pendingImport && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs">
            {t("organize.range_label", { ns: "tools" })}
            <input
              value={rangeText}
              onChange={(event) => setRangeText(event.target.value)}
              placeholder={t("organize.range_placeholder", { ns: "tools" })}
              className="k-input min-w-0 w-full"
            />
          </label>
          <Button onClick={confirmImport}>
            {t("organize.insert_confirm", { ns: "tools" })}
          </Button>
        </div>
      )}
      <div
        role="listbox"
        aria-multiselectable="true"
        className="grid max-h-[480px] grid-cols-2 gap-2 overflow-auto"
      >
        {org.pages.map((page, index) => {
          const selected = org.selectedIds.includes(page.id);
          return (
            <div
              key={page.id}
              role="option"
              aria-selected={selected}
              draggable
              onClick={(event) => onCardClick(event, page.id)}
              onDragStart={(event) => onDragStart(event, page.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(page.id)}
              onDragEnd={() => setDragIds(null)}
              className={cn(
                "relative flex flex-col items-center border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 text-xs",
                page.deleted && "opacity-30 line-through",
                selected && "bg-[var(--color-accent-soft)] font-bold text-[var(--color-accent-soft-foreground)]",
                dragIds?.includes(page.id) && "outline-2 outline-[var(--color-focus)]",
              )}
            >
              {page.blank ? (
                <div className="flex h-24 w-16 items-center justify-center border border-dashed text-[10px] text-[var(--color-text-muted)]">
                  {t("organize.blank", { ns: "tools" })}
                </div>
              ) : page.imported ? (
                <div className="flex h-24 w-16 items-center justify-center border border-dashed text-[10px] text-[var(--color-text-muted)]">
                  {t("organize.imported", { ns: "tools" })}
                </div>
              ) : (
                <div
                  style={{
                    transform: `rotate(${page.rotation}deg)`,
                    transformOrigin: "center",
                  }}
                >
                  <PdfViewer pdf={pdf} pageIndex={page.originalIndex ?? 0} zoom={0.18} />
                </div>
              )}
              <div
                className="mt-1 flex flex-wrap items-center gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  title={t("organize.move_up", { ns: "tools" })}
                  aria-label={t("organize.move_up", { ns: "tools" })}
                  className="rounded px-1 text-xs hover:bg-[var(--color-surface-active)]"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title={t("organize.move_down", { ns: "tools" })}
                  aria-label={t("organize.move_down", { ns: "tools" })}
                  className="rounded px-1 text-xs hover:bg-[var(--color-surface-active)]"
                  onClick={() => moveDown(index)}
                  disabled={index === org.pages.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  title={t("organize.rotate_left", { ns: "tools" })}
                  aria-label={t("organize.rotate_left", { ns: "tools" })}
                  className="rounded px-1 text-xs hover:bg-[var(--color-surface-active)]"
                  onClick={() => commit(rotatePage(org, page.id, 270))}
                >
                  ⟲
                </button>
                <button
                  type="button"
                  title={t("organize.rotate_right", { ns: "tools" })}
                  aria-label={t("organize.rotate_right", { ns: "tools" })}
                  className="rounded px-1 text-xs hover:bg-[var(--color-surface-active)]"
                  onClick={() => commit(rotatePage(org, page.id, 90))}
                >
                  ⟳
                </button>
                <button
                  type="button"
                  title={t("organize.rotate_180", { ns: "tools" })}
                  aria-label={t("organize.rotate_180", { ns: "tools" })}
                  className="rounded px-1 text-xs hover:bg-[var(--color-surface-active)]"
                  onClick={() => commit(rotatePage(org, page.id, 180))}
                >
                  ⇅
                </button>
                <button
                  type="button"
                  title={
                    page.deleted
                      ? t("organize.undo_delete", { ns: "tools" })
                      : t("organize.delete", { ns: "tools" })
                  }
                  aria-label={
                    page.deleted
                      ? t("organize.undo_delete", { ns: "tools" })
                      : t("organize.delete", { ns: "tools" })
                  }
                  className="rounded px-1 text-xs hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                  onClick={() => commit(toggleDeleted(org, page.id))}
                >
                  ✕
                </button>
                <button
                  type="button"
                  title={t("organize.insert_blank_after", { ns: "tools" })}
                  aria-label={t("organize.insert_blank_after", { ns: "tools" })}
                  className="rounded px-1 text-xs hover:bg-[var(--color-surface-active)]"
                  onClick={() => commit(insertBlankAfter(org, page.id))}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Button onClick={() => void apply()} disabled={!dirty || busy}>
        {busy
          ? t("organize.working", { ns: "tools" })
          : t("organize.apply", { ns: "tools" })}
      </Button>
      {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
    </div>
  );
}
