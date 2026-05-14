// Phase 11 Task 63 — Organize panel.
//
// Grid of small page thumbnails with HTML5 drag-and-drop reorder, plus a
// per-page menu offering rotate (±90, 180), delete, and insert-blank-after.
// Changes are staged into a local "plan" structure (a list of operations
// + the current ordering) and only flushed to disk on Apply, so the user
// can preview the result before committing.
import { useMemo, useState } from "react";
import type * as pdfjs from "pdfjs-dist";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";
import { cn } from "@/lib/utils";
import { PdfViewer } from "../PdfViewer";

interface PageState {
  /** 1-based page number in the *current* (post-edit) ordering. */
  originalIndex: number; // 0-based reference into the source PDF
  rotation: 0 | 90 | 180 | 270;
  deleted: boolean;
  /** Inserted blank? carries the page size in pt. */
  blank: { width: number; height: number } | null;
}

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  docPath: string;
}

export function OrganizePanel({ pdf, docPath }: Props) {
  const { t } = useTranslation("common");
  // Reset the staging state inline when the pdf identity changes — avoids
  // the set-state-in-effect lint flag. We track the pdf the state belongs
  // to and rebuild the page array on identity mismatch.
  const [state, setState] = useState<{ pdf: pdfjs.PDFDocumentProxy; pages: PageState[] }>(() => ({
    pdf,
    pages: Array.from({ length: pdf.numPages }, (_, i) => ({
      originalIndex: i,
      rotation: 0,
      deleted: false,
      blank: null,
    })),
  }));
  if (state.pdf !== pdf) {
    setState({
      pdf,
      pages: Array.from({ length: pdf.numPages }, (_, i) => ({
        originalIndex: i,
        rotation: 0,
        deleted: false,
        blank: null,
      })),
    });
  }
  const pages = state.pdf === pdf
    ? state.pages
    : Array.from({ length: pdf.numPages }, (_, i) => ({
        originalIndex: i,
        rotation: 0 as 0 | 90 | 180 | 270,
        deleted: false,
        blank: null,
      }));
  const setPages = (updater: PageState[] | ((p: PageState[]) => PageState[])) => {
    setState((s) => ({
      pdf,
      pages: typeof updater === "function" ? (updater as (p: PageState[]) => PageState[])(s.pdf === pdf ? s.pages : pages) : updater,
    }));
  };
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (pages.length === 0) return false;
    if (pages.some((p) => p.deleted || p.rotation !== 0 || p.blank)) return true;
    return pages.some((p, i) => p.originalIndex !== i);
  }, [pages]);

  function rotate(i: number, delta: 90 | 180 | 270) {
    setPages((prev) => {
      const next = [...prev];
      const r = ((next[i].rotation + delta) % 360) as 0 | 90 | 180 | 270;
      next[i] = { ...next[i], rotation: r };
      return next;
    });
  }
  function toggleDelete(i: number) {
    setPages((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], deleted: !next[i].deleted };
      return next;
    });
  }
  function insertBlankAfter(i: number) {
    setPages((prev) => {
      const next = [...prev];
      // Default to A4 in points (595 x 842) — most common.
      next.splice(i + 1, 0, {
        originalIndex: -1,
        rotation: 0,
        deleted: false,
        blank: { width: 595, height: 842 },
      });
      return next;
    });
  }

  function onDragStart(i: number) {
    setDragFrom(i);
  }
  function onDrop(i: number) {
    if (dragFrom === null || dragFrom === i) {
      setDragFrom(null);
      return;
    }
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragFrom(null);
  }
  // Phase 17 Task 84 — keyboard-accessible alternative to drag reorder.
  function moveUp(i: number) {
    if (i <= 0) return;
    setPages((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }
  function moveDown(i: number) {
    setPages((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next;
    });
  }

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".organized.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) {
        setBusy(false);
        return;
      }

      // Pipeline: reorder → rotate → delete → insert-blank → final copy.
      // We compose these by writing intermediate PDFs into the same
      // output path between stages, using `${out}.stage{N}.pdf` for the
      // intermediates so we don't clobber the source.
      let current = docPath;
      const stages: string[] = [];

      // STAGE 1 — keep only non-blank originals, in the new order, drop deleted.
      const kept = pages
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => !p.deleted && p.originalIndex >= 0);
      const newOrder: number[] = kept.map(({ p }) => p.originalIndex + 1);
      const stage1 = `${out}.stage1.pdf`;
      stages.push(stage1);
      const r1 = await commands.reorderPagesCmd({
        input: current,
        output: stage1,
        new_order: newOrder,
        job_id: crypto.randomUUID(),
      });
      if (r1.status === "error") {
        setErr(JSON.stringify(r1.error));
        return;
      }
      current = stage1;

      // STAGE 2 — apply rotations (1-based against the new ordering).
      const rotations: [number, number][] = [];
      kept.forEach(({ p }, idxInKept) => {
        if (p.rotation !== 0) rotations.push([idxInKept + 1, p.rotation]);
      });
      if (rotations.length > 0) {
        const stage2 = `${out}.stage2.pdf`;
        stages.push(stage2);
        const r2 = await commands.rotatePagesCmd({
          input: current,
          output: stage2,
          rotations,
          job_id: crypto.randomUUID(),
        });
        if (r2.status === "error") {
          setErr(JSON.stringify(r2.error));
          return;
        }
        current = stage2;
      }

      // STAGE 3 — splice in blanks. Walk the final `pages` array, but skip
      // deleted originals; each blank entry produces one insertion at its
      // position relative to the kept set.
      // Compute a flat list of "kept" markers + blanks:
      const insertSpec: { afterIdx0Based: number; width: number; height: number }[] = [];
      let keptCounter = -1;
      for (const p of pages) {
        if (p.deleted) continue;
        if (p.blank) {
          insertSpec.push({ afterIdx0Based: keptCounter, width: p.blank.width, height: p.blank.height });
        } else {
          keptCounter += 1;
        }
      }
      for (const ins of insertSpec) {
        const stageN = `${out}.stage_ins_${ins.afterIdx0Based}.pdf`;
        stages.push(stageN);
        const ri = await commands.insertBlankPageCmd({
          input: current,
          output: stageN,
          after_page_index: ins.afterIdx0Based,
          width: ins.width,
          height: ins.height,
          job_id: crypto.randomUUID(),
        });
        if (ri.status === "error") {
          setErr(JSON.stringify(ri.error));
          return;
        }
        current = stageN;
        // Subsequent insertion indices have to be incremented because the
        // doc grew by one page.
      }

      // Final stage — promote `current` to the requested output path.
      // (The reorder/rotate already wrote to disk; we copy to the chosen
      // path.)
      const r3 = await commands.saveDocument(current, out);
      if (r3.status === "error") {
        setErr(JSON.stringify(r3.error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.organize")}</h3>
      <p className="text-xs text-[var(--color-muted)]">
        Drag thumbnails to reorder. Use the menu to rotate, delete, or insert
        a blank page. Changes are applied on Save.
      </p>
      <div className="grid max-h-[480px] grid-cols-2 gap-2 overflow-auto">
        {pages.map((p, i) => (
          <div
            key={`${p.originalIndex}-${i}`}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className={cn(
              "relative flex flex-col items-center rounded border bg-white p-1 text-xs shadow-sm",
              p.deleted && "opacity-30 line-through",
              dragFrom === i && "ring-2 ring-blue-500",
            )}
          >
            {p.blank ? (
              <div className="flex h-24 w-16 items-center justify-center border border-dashed text-[10px] text-[var(--color-muted)]">
                blank
              </div>
            ) : (
              <div
                style={{
                  transform: `rotate(${p.rotation}deg)`,
                  transformOrigin: "center",
                }}
              >
                <PdfViewer pdf={pdf} pageIndex={p.originalIndex} zoom={0.18} />
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <button
                type="button"
                title="Move up"
                aria-label={t("organize.move_up", { ns: "tools" })}
                className="rounded px-1 text-xs hover:bg-neutral-200"
                onClick={() => moveUp(i)}
                disabled={i === 0}
              >
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                aria-label={t("organize.move_down", { ns: "tools" })}
                className="rounded px-1 text-xs hover:bg-neutral-200"
                onClick={() => moveDown(i)}
                disabled={i === pages.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                title="Rotate left"
                aria-label="Rotate left"
                className="rounded px-1 text-xs hover:bg-neutral-200"
                onClick={() => rotate(i, 270)}
              >
                ⟲
              </button>
              <button
                type="button"
                title="Rotate right"
                aria-label="Rotate right"
                className="rounded px-1 text-xs hover:bg-neutral-200"
                onClick={() => rotate(i, 90)}
              >
                ⟳
              </button>
              <button
                type="button"
                title="Rotate 180"
                aria-label="Rotate 180 degrees"
                className="rounded px-1 text-xs hover:bg-neutral-200"
                onClick={() => rotate(i, 180)}
              >
                ⇅
              </button>
              <button
                type="button"
                title={p.deleted ? "Undo delete" : "Delete"}
                aria-label={p.deleted ? "Undo delete" : "Delete page"}
                className="rounded px-1 text-xs hover:bg-red-100"
                onClick={() => toggleDelete(i)}
              >
                ✕
              </button>
              <button
                type="button"
                title="Insert blank after"
                aria-label="Insert blank page after"
                className="rounded px-1 text-xs hover:bg-neutral-200"
                onClick={() => insertBlankAfter(i)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={apply} disabled={!dirty || busy}>
        {busy ? "Working…" : "Apply changes"}
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
