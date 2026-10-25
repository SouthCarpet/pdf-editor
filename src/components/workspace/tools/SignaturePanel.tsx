import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { PenLine, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SignatureRecord } from "@/bindings";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/projects/ConfirmDeleteDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { readToken } from "@/lib/tokens";
import { useSignatureStore } from "@/stores/signatureStore";
import { useLocalPngUrl } from "../useLocalPngUrl";
import {
  BUNDLED_STAMPS,
  bundledStampBytes,
  bundledStampDataUrl,
  type BundledStamp,
} from "./signatureStampAssets";

interface Props {
  onChoose: (signature: SignatureRecord) => void;
}

export function SignaturePanel({ onChoose }: Props) {
  const { t } = useTranslation("workspace");
  const items = useSignatureStore((state) => state.items);
  const loading = useSignatureStore((state) => state.loading);
  const error = useSignatureStore((state) => state.error);
  const load = useSignatureStore((state) => state.load);
  const importPath = useSignatureStore((state) => state.importPath);
  const createFromPngBytes = useSignatureStore((state) => state.createFromPngBytes);
  const remove = useSignatureStore((state) => state.remove);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignatureRecord | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadPng() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (typeof selected !== "string") return;
    const signature = await importPath(selected);
    if (signature !== null) onChoose(signature);
  }

  async function chooseStamp(stamp: BundledStamp) {
    const signature = await createFromPngBytes(
      bundledStampBytes(stamp),
      t(stamp.nameKey),
    );
    if (signature !== null) onChoose(signature);
  }

  function deleteSignature() {
    if (deleteTarget === null) return;
    void remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <section aria-labelledby="signature-panel-title" className="space-y-4">
      <div>
        <h2 id="signature-panel-title" className="text-sm font-semibold text-balance">
          {t("signature.title")}
        </h2>
        <p className="mt-1 text-xs text-pretty text-[var(--color-text-muted)]">
          {t("signature.description")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setDrawingOpen(true)} className="min-h-[var(--control-h)] gap-2">
          <PenLine className="size-4" aria-hidden="true" />
          {t("signature.draw")}
        </Button>
        <Button
          variant="outline"
          onClick={() => void uploadPng()}
          className="min-h-[var(--control-h)] gap-2"
        >
          <Upload className="size-4" aria-hidden="true" />
          {t("signature.upload")}
        </Button>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium">{t("signature.saved")}</h3>
        {loading && <p className="text-xs text-[var(--color-text-muted)]">{t("signature.loading")}</p>}
        {!loading && items.length === 0 && (
          <p className="text-xs text-pretty text-[var(--color-text-muted)]">
            {t("signature.empty")}
          </p>
        )}
        <div className="space-y-2">
          {items.map((signature) => (
            <SavedSignature
              key={signature.id}
              signature={signature}
              onChoose={() => onChoose(signature)}
              onDelete={() => setDeleteTarget(signature)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium">{t("signature.stamps.title")}</h3>
        <div className="grid gap-2">
          {BUNDLED_STAMPS.map((stamp) => (
            <button
              key={stamp.id}
              type="button"
              onClick={() => void chooseStamp(stamp)}
              className="min-h-[var(--control-h)] rounded-md bg-[var(--color-surface-raised)] p-2 text-left transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2"
            >
              <img
                src={bundledStampDataUrl(stamp)}
                alt={t(stamp.nameKey)}
                className="h-10 w-full object-contain outline -outline-offset-1 outline-[var(--color-border)]"
              />
            </button>
          ))}
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {t("signature.error", { error })}
        </p>
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        title={t("signature.delete_named", { name: deleteTarget?.name })}
        body={t("signature.delete_confirm", { name: deleteTarget?.name })}
        onConfirm={deleteSignature}
        onCancel={() => setDeleteTarget(null)}
      />
      <SignatureDrawingDialog
        open={drawingOpen}
        onClose={() => setDrawingOpen(false)}
        onSave={async (bytes, name) => {
          const signature = await createFromPngBytes(bytes, name);
          if (signature === null) return false;
          setDrawingOpen(false);
          onChoose(signature);
          return true;
        }}
      />
    </section>
  );
}

function SavedSignature({
  signature,
  onChoose,
  onDelete,
}: {
  signature: SignatureRecord;
  onChoose: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("workspace");
  const url = useLocalPngUrl(signature.file_path);
  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--color-surface-raised)] p-2">
      <button
        type="button"
        onClick={onChoose}
        aria-label={t("signature.place_named", { name: signature.name })}
        className="min-h-[var(--control-h)] min-w-0 flex-1 rounded-sm text-left transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2"
      >
        {url !== null && (
          <img
            src={url}
            alt=""
            className="h-10 w-full object-contain outline -outline-offset-1 outline-[var(--color-border)]"
          />
        )}
        <span className="mt-1 block truncate px-1 text-xs">{signature.name}</span>
      </button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onDelete}
        aria-label={t("signature.delete_named", { name: signature.name })}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

const DRAWING_WIDTH = 480;
const DRAWING_HEIGHT = 180;
const RASTER_SCALE = 2;

function SignatureDrawingDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (bytes: number[], name: string) => Promise<boolean>;
}) {
  const { t } = useTranslation("workspace");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [penWidth, setPenWidth] = useState(3);
  // Minor 2 (plan 062 final fix wave F8): themed ink, not a fixed hex. The
  // dark canvas background is `--color-surface-raised`; a literal near-black
  // ("#111827") nearly vanishes on it. Canvas 2D cannot resolve `var(...)`
  // itself (same reason `CropOverlay` reads tokens), so `readToken`
  // resolves the live value each render.
  const [colorChoice, setColorChoice] = useState<"foreground" | "accent">("foreground");
  const foregroundColor = readToken("--color-text", "#111827");
  const accentColor = readToken("--color-accent", "#1d4ed8");
  const color = colorChoice === "foreground" ? foregroundColor : accentColor;
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const initializeCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (canvas === null) return;
    canvas.width = DRAWING_WIDTH * RASTER_SCALE;
    canvas.height = DRAWING_HEIGHT * RASTER_SCALE;
    canvas.getContext("2d")?.setTransform(RASTER_SCALE, 0, 0, RASTER_SCALE, 0, 0);
  }, []);

  if (!open) return null;

  function point(event: ReactPointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * DRAWING_WIDTH) / rect.width,
      ((event.clientY - rect.top) * DRAWING_HEIGHT) / rect.height,
    ];
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (context === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.strokeStyle = color;
    context.lineWidth = penWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    drawingRef.current = true;
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (context === null) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas === null || canvas === undefined || context === null || context === undefined) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  async function saveDrawing() {
    const canvas = canvasRef.current;
    if (canvas === null || name.trim() === "") return;
    setSaving(true);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob === null) {
      setSaving(false);
      return;
    }
    const saved = await onSave(Array.from(new Uint8Array(await blob.arrayBuffer())), name.trim());
    if (!saved) setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("signature.drawing.cancel")} className="w-[min(560px,calc(100vw-2rem))] space-y-4">
        <DialogHeader>
          <DialogTitle id="signature-drawing-title">
            {t("signature.drawing.title")}
          </DialogTitle>
          <DialogDescription>
            {t("signature.drawing.description")}
          </DialogDescription>
        </DialogHeader>

        <canvas
          ref={initializeCanvas}
          aria-label={t("signature.drawing.canvas")}
          className="h-[180px] w-full touch-none border border-[var(--color-border)] bg-[var(--color-surface-raised)]"
          onPointerDown={startDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
        />

        <div className="flex flex-wrap items-center gap-3">
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">{t("signature.drawing.pen_width")}</legend>
            {[2, 3, 5].map((width) => (
              <button
                key={width}
                type="button"
                aria-pressed={penWidth === width}
                onClick={() => setPenWidth(width)}
                className={cn(
                  "min-h-[var(--control-h)] min-w-[var(--control-h)] rounded-md px-2 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2",
                  penWidth === width
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)]",
                )}
              >
                {width}
              </button>
            ))}
          </fieldset>
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">{t("signature.drawing.color")}</legend>
            {(["foreground", "accent"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-label={t(choice === "foreground" ? "signature.drawing.black" : "signature.drawing.blue")}
                aria-pressed={colorChoice === choice}
                onClick={() => setColorChoice(choice)}
                className={cn(
                  "min-h-[var(--control-h)] min-w-[var(--control-h)] rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2",
                  colorChoice === choice && "outline-2 outline-offset-2 outline-[var(--color-focus)]",
                )}
              >
                <span
                  className="block size-5 rounded-full"
                  style={{ backgroundColor: choice === "foreground" ? foregroundColor : accentColor }}
                />
              </button>
            ))}
          </fieldset>
          <Button type="button" variant="ghost" onClick={clearDrawing}>
            {t("signature.drawing.clear")}
          </Button>
        </div>

        <label className="block text-xs font-medium">
          {t("signature.drawing.name")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="k-input min-w-0 w-full"
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t("signature.drawing.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void saveDrawing()}
            disabled={saving || name.trim() === ""}
          >
            {saving ? t("signature.drawing.saving") : t("signature.drawing.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
