// Phase 11 Task 62 / plan 062 T5.2 - Crop panel.
//
// The dashed rectangle overlay is rendered by the parent (Workspace.tsx)
// inside OverlayCanvas. T5.2 puts eight handles in `CropOverlay`; the
// parent still holds `rect` and passes `onRectChange`. Apply clears
// history (T2.2: undo covers crop operations before Apply).
import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { useWorkspace } from "@/stores/workspaceStore";
import { historyStore } from "@/stores/historyStore";
import { PdfViewer } from "../PdfViewer";
import { commitCropRectChange } from "./cropHistory";
import {
  CROP_PREVIEW_BOX,
  clampCropRect,
  cropPreviewClip,
  fromPercent,
  mmToPt,
  presetA4,
  presetFullPage,
  presetMargins,
  toDisplay,
  type CropPage,
  type CropRect,
} from "./cropModel";

export type { CropRect };

interface Props {
  docPath: string;
  pageWidth: number;
  pageHeight: number;
  rect: CropRect;
  onRectChange: (r: CropRect, recordHistory?: boolean) => void;
}

export function CropPanel({ docPath, pageWidth, pageHeight, rect, onRectChange }: Props) {
  const { t } = useTranslation("common");
  const [applyAll, setApplyAll] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pageIndex = useWorkspace((s) => s.activePage);
  const page: CropPage = { width: pageWidth, height: pageHeight };
  const display = toDisplay(rect, page);
  const onRectChangeRef = useRef(onRectChange);
  useEffect(() => {
    onRectChangeRef.current = onRectChange;
  }, [onRectChange]);
  const applyRect = (next: CropRect) => onRectChangeRef.current(next, false);
  const pdfDoc = usePdfDocument(preview ? docPath : null);

  useEffect(() => {
    if (rect.x === 0 && rect.y === 0 && rect.width === 0 && rect.height === 0) {
      onRectChangeRef.current(
        {
          x: 20,
          y: 20,
          width: Math.max(pageWidth - 40, 10),
          height: Math.max(pageHeight - 40, 10),
        },
        false,
      );
    }
  }, [pageWidth, pageHeight, rect.x, rect.y, rect.width, rect.height]);

  function changeRect(next: CropRect) {
    commitCropRectChange(docPath, rect, clampCropRect(next, page), applyRect);
  }

  function setMm(field: "x" | "y" | "width" | "height", mm: number) {
    if (!Number.isFinite(mm)) return;
    changeRect({ ...rect, [field]: mmToPt(mm) });
  }

  function setWidthPct(pct: number) {
    if (!Number.isFinite(pct)) return;
    const sized = fromPercent(page, pct, display.heightPct, "topLeft");
    changeRect({ ...rect, width: sized.width });
  }

  function setHeightPct(pct: number) {
    if (!Number.isFinite(pct)) return;
    const sized = fromPercent(page, display.widthPct, pct, "topLeft");
    changeRect({ ...rect, height: sized.height });
  }

  async function autoDetect() {
    setBusy(true);
    setErr(null);
    try {
      const result = await commands.cropPdfCmd({
        input: docPath,
        output: docPath + ".autodetect-probe.tmp",
        page_index: pageIndex,
        bbox: null,
        auto_detect: true,
        apply_to_all_pages: false,
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") {
        setErr(
          t(`errors:${result.error.key}`, {
            ...((result.error.data as Record<string, unknown> | null) ?? {}),
            defaultValue: result.error.key,
          }),
        );
        return;
      }
      const [x, y, w, h] = result.data.bbox_applied;
      changeRect({ x: x ?? 0, y: y ?? 0, width: w ?? pageWidth, height: h ?? pageHeight });
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
        page_index: pageIndex,
        bbox: [rect.x, rect.y, rect.width, rect.height],
        auto_detect: false,
        apply_to_all_pages: applyAll,
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") {
        setErr(
          t(`errors:${result.error.key}`, {
            ...((result.error.data as Record<string, unknown> | null) ?? {}),
            defaultValue: result.error.key,
          }),
        );
      } else {
        historyStore.getState().clear(docPath);
      }
    } finally {
      setBusy(false);
    }
  }

  const clip = cropPreviewClip(rect, page, CROP_PREVIEW_BOX);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.crop")}</h3>
      <p className="text-xs text-[var(--color-text-muted)]">{t("crop_panel.description")}</p>
      <div className="grid grid-cols-2 gap-1 text-xs">
        <label className="flex flex-col">
          {t("crop_panel.x")}
          <input
            type="number"
            step="0.01"
            value={display.xMm.toFixed(2)}
            onChange={(e) => setMm("x", Number(e.target.value))}
            className="k-input min-w-0 w-full"
          />
        </label>
        <label className="flex flex-col">
          {t("crop_panel.y")}
          <input
            type="number"
            step="0.01"
            value={display.yMm.toFixed(2)}
            onChange={(e) => setMm("y", Number(e.target.value))}
            className="k-input min-w-0 w-full"
          />
        </label>
        <label className="flex flex-col">
          {t("crop_panel.width")}
          <input
            type="number"
            step="0.01"
            value={display.widthMm.toFixed(2)}
            onChange={(e) => setMm("width", Number(e.target.value))}
            className="k-input min-w-0 w-full"
          />
        </label>
        <label className="flex flex-col">
          {t("crop_panel.height")}
          <input
            type="number"
            step="0.01"
            value={display.heightMm.toFixed(2)}
            onChange={(e) => setMm("height", Number(e.target.value))}
            className="k-input min-w-0 w-full"
          />
        </label>
        <label className="flex flex-col">
          {t("crop_panel.width_percent")}
          <input
            type="number"
            step="0.1"
            value={display.widthPct.toFixed(1)}
            onChange={(e) => setWidthPct(Number(e.target.value))}
            className="k-input min-w-0 w-full"
          />
        </label>
        <label className="flex flex-col">
          {t("crop_panel.height_percent")}
          <input
            type="number"
            step="0.1"
            value={display.heightPct.toFixed(1)}
            onChange={(e) => setHeightPct(Number(e.target.value))}
            className="k-input min-w-0 w-full"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="outline" disabled={busy} onClick={() => changeRect(presetA4(page))}>
          {t("crop_panel.preset_a4")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => changeRect(presetMargins(page, 10))}
        >
          {t("crop_panel.preset_margins")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => changeRect(presetFullPage(page))}
        >
          {t("crop_panel.preset_full")}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <span className="k-check">
          <input className="k-check-input"
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
          />
          <svg className="k-check-mark" viewBox="0 0 12 12" aria-hidden="true"><path className="k-check-tick" pathLength="1" d="M2 6 5 9 10 3" /></svg>
        </span>
        {t("crop.apply_to_all", { ns: "tools" })}
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="k-check">
          <input className="k-check-input"
            type="checkbox"
            checked={preview}
            onChange={(e) => setPreview(e.target.checked)}
          />
          <svg className="k-check-mark" viewBox="0 0 12 12" aria-hidden="true"><path className="k-check-tick" pathLength="1" d="M2 6 5 9 10 3" /></svg>
        </span>
        {t("crop_panel.preview")}
      </label>
      {preview && pdfDoc && (
        <div
          data-testid="crop-preview"
          className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-background)]"
          style={{
            width: clip.fittedWidth,
            height: clip.fittedHeight,
            clipPath: `inset(${clip.inset.top}px ${clip.inset.right}px ${clip.inset.bottom}px ${clip.inset.left}px)`,
          }}
        >
          <PdfViewer pdf={pdfDoc.pdf} pageIndex={pageIndex} zoom={1} fitBox={CROP_PREVIEW_BOX} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="outline" disabled={busy} onClick={autoDetect}>
          {t("crop_panel.auto_detect")}
        </Button>
        <Button disabled={busy} onClick={apply}>
          {t("crop_panel.apply")}
        </Button>
      </div>
      {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
    </div>
  );
}
