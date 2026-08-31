import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { PenLine, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SignatureRecord } from "@/bindings";
import { Button } from "@/components/ui/button";
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

  async function deleteSignature(signature: SignatureRecord) {
    if (!window.confirm(t("signature.delete_confirm", { name: signature.name }))) return;
    await remove(signature.id);
  }

  return (
    <section aria-labelledby="signature-panel-title" className="space-y-4">
      <div>
        <h2 id="signature-panel-title" className="text-sm font-semibold text-balance">
          {t("signature.title")}
        </h2>
        <p className="mt-1 text-xs text-pretty text-[var(--color-muted)]">
          {t("signature.description")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => setDrawingOpen(true)} className="min-h-10 gap-2">
          <PenLine className="size-4" aria-hidden="true" />
          {t("signature.draw")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void uploadPng()}
          className="min-h-10 gap-2"
        >
          <Upload className="size-4" aria-hidden="true" />
          {t("signature.upload")}
        </Button>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium">{t("signature.saved")}</h3>
        {loading && <p className="text-xs text-[var(--color-muted)]">{t("signature.loading")}</p>}
        {!loading && items.length === 0 && (
          <p className="text-xs text-pretty text-[var(--color-muted)]">
            {t("signature.empty")}
          </p>
        )}
        <div className="space-y-2">
          {items.map((signature) => (
            <SavedSignature
              key={signature.id}
              signature={signature}
              onChoose={() => onChoose(signature)}
              onDelete={() => void deleteSignature(signature)}
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
              className="min-h-10 rounded-md bg-[var(--color-control)] p-2 text-left shadow-[0_0_0_1px_rgba(0,0,0,0.06)] transition-[scale,background-color,box-shadow] duration-150 ease-out hover:bg-[var(--color-control-hover)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2"
            >
              <img
                src={bundledStampDataUrl(stamp)}
                alt={t(stamp.nameKey)}
                className="h-10 w-full object-contain outline -outline-offset-1 outline-black/10"
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
    <div className="flex items-center gap-2 rounded-md bg-[var(--color-control)] p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
      <button
        type="button"
        onClick={onChoose}
        aria-label={t("signature.place_named", { name: signature.name })}
        className="min-h-10 min-w-0 flex-1 rounded-sm text-left transition-[scale,background-color] duration-150 ease-out hover:bg-[var(--color-control-hover)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2"
      >
        {url !== null && (
          <img
            src={url}
            alt=""
            className="h-10 w-full object-contain outline -outline-offset-1 outline-black/10"
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
  // dark canvas background is `--color-control`; a literal near-black
  // ("#111827") nearly vanishes on it. Canvas 2D cannot resolve `var(...)`
  // itself (same reason `CropOverlay` reads tokens), so `readToken`
  // resolves the live value each render.
  const [colorChoice, setColorChoice] = useState<"foreground" | "accent">("foreground");
  const foregroundColor = readToken("--color-foreground", "#111827");
  const accentColor = readToken("--color-accent", "#1d4ed8");
  const color = colorChoice === "foreground" ? foregroundColor : accentColor;
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || canvasRef.current === null) return;
    const canvas = canvasRef.current;
    canvas.width = DRAWING_WIDTH * RASTER_SCALE;
    canvas.height = DRAWING_HEIGHT * RASTER_SCALE;
    canvas.getContext("2d")?.setTransform(RASTER_SCALE, 0, 0, RASTER_SCALE, 0, 0);
  }, [open]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-soft)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-drawing-title"
        className="w-[min(560px,calc(100vw-2rem))] space-y-4 rounded-lg bg-[var(--color-card)] p-5 text-[var(--color-foreground)] shadow-xl"
      >
        <div>
          <h2 id="signature-drawing-title" className="text-lg font-semibold text-balance">
            {t("signature.drawing.title")}
          </h2>
          <p className="mt-1 text-sm text-pretty text-[var(--color-muted)]">
            {t("signature.drawing.description")}
          </p>
        </div>

        <canvas
          ref={canvasRef}
          aria-label={t("signature.drawing.canvas")}
          className="h-[180px] w-full touch-none rounded-md bg-[var(--color-control)] shadow-[inset_0_0_0_1px_var(--color-border)]"
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
                  "min-h-10 min-w-10 rounded-md px-2 text-xs tabular-nums transition-[scale,background-color,color] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2",
                  penWidth === width
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                    : "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)]",
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
                  "min-h-10 min-w-10 rounded-md p-2 transition-[scale,box-shadow] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2",
                  colorChoice === choice && "shadow-[0_0_0_2px_var(--color-focus)]",
                )}
              >
                <span
                  className="block size-5 rounded-full"
                  style={{ backgroundColor: choice === "foreground" ? foregroundColor : accentColor }}
                />
              </button>
            ))}
          </fieldset>
          <Button type="button" size="sm" variant="ghost" onClick={clearDrawing}>
            {t("signature.drawing.clear")}
          </Button>
        </div>

        <label className="block text-xs font-medium">
          {t("signature.drawing.name")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-control)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2"
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
      </div>
    </div>
  );
}
