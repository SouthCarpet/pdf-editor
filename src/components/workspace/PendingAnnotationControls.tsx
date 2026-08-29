// Plan 050 task D2-UX (R2): the control strip for a selected pending
// FreeText annotation, whichever flow added it (Forms fill or the
// Annotations panel). A plain HTML overlay for the same reason
// `DetectedFieldFill` is one: Konva cannot host real text input.
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ScreenRect } from "./detectedFieldGeometry";
import { getPendingTextPalette } from "./pendingAnnotationColors";

interface Props {
  screenRect: ScreenRect;
  text: string;
  sizePt: number;
  colorHex: string;
  onChangeText: (value: string) => void;
  onChangeSize: (sizePt: number) => void;
  onChangeColor: (hex: string) => void;
  onDelete: () => void;
}

// PDF /DA font size range this app writes (see `TextStyle.size_pt`).
const MIN_SIZE_PT = 6;
const MAX_SIZE_PT = 200;
const SIZE_STEP_PT = 1;

export function PendingAnnotationControls({
  screenRect,
  text,
  sizePt,
  colorHex,
  onChangeText,
  onChangeSize,
  onChangeColor,
  onDelete,
}: Props) {
  const { t } = useTranslation("workspace");
  const palette = getPendingTextPalette();

  function step(delta: number) {
    const next = Math.round(sizePt + delta);
    onChangeSize(Math.min(MAX_SIZE_PT, Math.max(MIN_SIZE_PT, next)));
  }

  return (
    <div
      role="group"
      aria-label={t("pending_annotation.title")}
      className="absolute z-20 w-64 space-y-2 rounded border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-xs shadow-lg"
      style={{ left: screenRect.x, top: screenRect.y + screenRect.height + 6 }}
    >
      <label className="block">
        <span className="text-[var(--color-muted)]">{t("pending_annotation.text_label")}</span>
        <input
          type="text"
          value={text}
          onChange={(event) => onChangeText(event.target.value)}
          className="mt-1 block w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--color-muted)]">{t("pending_annotation.size_label")}</span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            aria-label={t("pending_annotation.size_decrease")}
            onClick={() => step(-SIZE_STEP_PT)}
          >
            -
          </Button>
          <span className="w-8 text-center tabular-nums">{Math.round(sizePt)}</span>
          <Button
            size="sm"
            variant="outline"
            aria-label={t("pending_annotation.size_increase")}
            onClick={() => step(SIZE_STEP_PT)}
          >
            +
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--color-muted)]">{t("pending_annotation.color_label")}</span>
        <div className="flex gap-1">
          {palette.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              aria-pressed={hex.toLowerCase() === colorHex.toLowerCase()}
              onClick={() => onChangeColor(hex)}
              className="h-5 w-5 rounded-full border-2"
              style={{
                background: hex,
                borderColor:
                  hex.toLowerCase() === colorHex.toLowerCase() ? "#111827" : "var(--color-border)",
              }}
            />
          ))}
        </div>
      </div>

      <Button size="sm" variant="outline" className="w-full" onClick={onDelete}>
        {t("pending_annotation.delete")}
      </Button>
    </div>
  );
}
