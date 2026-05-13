// Phase 11 Task 62 — Crop panel.
//
// The panel itself lives in the right-hand workspace slot. The dashed
// rectangle overlay is rendered by the parent (Workspace.tsx) inside the
// shared OverlayCanvas so it stacks above the PDF.js raster. We expose a
// pair of imperative helpers on the panel — Auto-detect and Apply — and
// hold the rectangle state locally; the parent reads it via the
// `rect`/`onRectChange` props.
import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";
import { useWorkspace } from "@/stores/workspaceStore";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  docPath: string;
  pageWidth: number;
  pageHeight: number;
  rect: CropRect;
  onRectChange: (r: CropRect) => void;
}

export function CropPanel({ docPath, pageWidth, pageHeight, rect, onRectChange }: Props) {
  const { t } = useTranslation("common");
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const page = useWorkspace((s) => s.activePage);

  // Reset the rectangle when the page geometry changes so the box doesn't
  // run off the edge of a different-sized page.
  useEffect(() => {
    if (rect.x === 0 && rect.y === 0 && rect.width === 0 && rect.height === 0) {
      onRectChange({ x: 20, y: 20, width: Math.max(pageWidth - 40, 10), height: Math.max(pageHeight - 40, 10) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth, pageHeight]);

  async function autoDetect() {
    setBusy(true);
    setErr(null);
    try {
      const result = await commands.cropPdfCmd({
        input: docPath,
        output: docPath + ".autodetect-probe.tmp",
        page_index: page,
        bbox: null,
        auto_detect: true,
        apply_to_all_pages: false,
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") {
        setErr(JSON.stringify(result.error));
        return;
      }
      const [x, y, w, h] = result.data.bbox_applied;
      onRectChange({ x: x ?? 0, y: y ?? 0, width: w ?? pageWidth, height: h ?? pageHeight });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".cropped.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) {
        setBusy(false);
        return;
      }
      const result = await commands.cropPdfCmd({
        input: docPath,
        output: out,
        page_index: page,
        bbox: [rect.x, rect.y, rect.width, rect.height],
        auto_detect: false,
        apply_to_all_pages: applyAll,
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") {
        setErr(JSON.stringify(result.error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.crop")}</h3>
      <p className="text-xs text-[var(--color-muted)]">
        Drag the dashed rectangle on the page to set the crop region, or use
        Auto-detect to find the content bounding box.
      </p>
      <div className="grid grid-cols-2 gap-1 text-xs">
        <label className="flex flex-col">
          x
          <input
            type="number"
            value={Math.round(rect.x)}
            onChange={(e) => onRectChange({ ...rect, x: Number(e.target.value) })}
            className="rounded border px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col">
          y
          <input
            type="number"
            value={Math.round(rect.y)}
            onChange={(e) => onRectChange({ ...rect, y: Number(e.target.value) })}
            className="rounded border px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col">
          width
          <input
            type="number"
            value={Math.round(rect.width)}
            onChange={(e) => onRectChange({ ...rect, width: Number(e.target.value) })}
            className="rounded border px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col">
          height
          <input
            type="number"
            value={Math.round(rect.height)}
            onChange={(e) => onRectChange({ ...rect, height: Number(e.target.value) })}
            className="rounded border px-1 py-0.5"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={applyAll}
          onChange={(e) => setApplyAll(e.target.checked)}
        />
        Apply to all pages
      </label>
      <div className="flex flex-col gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={autoDetect}>
          Auto-detect
        </Button>
        <Button size="sm" disabled={busy} onClick={apply}>
          Apply crop
        </Button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
