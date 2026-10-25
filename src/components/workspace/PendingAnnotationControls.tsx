// Plan 050 task D2-UX (R2): the control strip for a selected pending
// FreeText annotation, whichever flow added it (Forms fill or the
// Annotations panel). A plain HTML overlay for the same reason
// `DetectedFieldFill` is one: Konva cannot host real text input.
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TextAlign, TextStyle, VerticalAlign } from "@/bindings";
import { Button } from "@/components/ui/button";
import type { ScreenRect } from "./detectedFieldGeometry";
import { getPendingTextPalette } from "./pendingAnnotationColors";
import {
  STANDARD_TEXT_FAMILIES,
  standardFontPostScriptName,
  type StandardTextFamily,
} from "./standardTextStyle";

export interface PendingTextStyleEditing {
  style: TextStyle;
  onChange: (style: TextStyle) => void;
}

interface Props {
  screenRect: ScreenRect;
  text: string;
  sizePt: number;
  colorHex: string;
  onChangeText: (value: string) => void;
  onChangeSize: (sizePt: number) => void;
  onChangeColor: (hex: string) => void;
  onDelete: () => void;
  /** R1 (plan 050 D2-UX-3b): closes the strip and deselects the pending
   * annotation, which stays in the pending list. Wired to the "Potvrdiť"
   * button, to Esc anywhere while the strip is open, and to Enter in the
   * text field. */
  onConfirm: () => void;
  /** One optional controller prop keeps existing callers safe while the
   * workspace owner wires the complete style patch through the annotation
   * store's update(docPath, clientId, { style }) operation. */
  styleEditing?: PendingTextStyleEditing;
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
  onConfirm,
  styleEditing,
}: Props) {
  const { t } = useTranslation("workspace");
  const palette = getPendingTextPalette();
  const style = styleEditing?.style ?? {
    font_family: "Helvetica",
    font_postscript_name: "Helvetica",
    size_pt: sizePt,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    color: [0, 0, 0],
    background: null,
    align: "left",
    vertical_align: "top",
    letter_spacing: 0,
    line_height_multiplier: 1.2,
  };
  const selectedFamily: StandardTextFamily = STANDARD_TEXT_FAMILIES.includes(
    style.font_family as StandardTextFamily
  )
    ? (style.font_family as StandardTextFamily)
    : "Helvetica";
  const horizontalAlignments: Array<{
    value: Exclude<TextAlign, "justify">;
    abbreviation: string;
    label: string;
    tooltip: string;
  }> = [
      {
        value: "left",
        abbreviation: "L",
        label: t("pending_annotation.align_left"),
        tooltip: t("pending_annotation.align_left_tooltip"),
      },
      {
        value: "center",
        abbreviation: "C",
        label: t("pending_annotation.align_center"),
        tooltip: t("pending_annotation.align_center_tooltip"),
      },
      {
        value: "right",
        abbreviation: "R",
        label: t("pending_annotation.align_right"),
        tooltip: t("pending_annotation.align_right_tooltip"),
      },
    ];
  const verticalAlignments: Array<{
    value: VerticalAlign;
    abbreviation: string;
    label: string;
    tooltip: string;
  }> = [
      {
        value: "top",
        abbreviation: "T",
        label: t("pending_annotation.align_top"),
        tooltip: t("pending_annotation.align_top_tooltip"),
      },
      {
        value: "middle",
        abbreviation: "M",
        label: t("pending_annotation.align_middle"),
        tooltip: t("pending_annotation.align_middle_tooltip"),
      },
      {
        value: "bottom",
        abbreviation: "B",
        label: t("pending_annotation.align_bottom"),
        tooltip: t("pending_annotation.align_bottom_tooltip"),
      },
    ];

  function changeStyle(patch: Partial<TextStyle>) {
    styleEditing?.onChange({ ...style, ...patch });
  }

  function changeFace(family: StandardTextFamily, bold: boolean, italic: boolean) {
    changeStyle({
      font_family: family,
      font_postscript_name: standardFontPostScriptName(family, bold, italic),
      bold,
      italic,
    });
  }

  function step(delta: number) {
    const next = Math.round(sizePt + delta);
    onChangeSize(Math.min(MAX_SIZE_PT, Math.max(MIN_SIZE_PT, next)));
  }

  // R1: Esc confirms (same as "Potvrdiť") wherever focus is while the
  // strip is open - the strip only exists while a pending annotation is
  // selected, so a document-level listener for its whole mounted lifetime
  // covers "focus in the strip or on the page" without guessing which
  // element the page's Konva canvas currently holds focus on.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onConfirm();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onConfirm]);

  return (
    <div
      role="group"
      aria-label={t("pending_annotation.title")}
      className="absolute z-20 w-[44rem] max-w-[calc(100vw-1rem)] space-y-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2 text-xs"
      style={{ left: screenRect.x, top: screenRect.y + screenRect.height + 6 }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1">
          <span className="text-[var(--color-text-muted)]">{t("pending_annotation.text_label")}</span>
          <input
            type="text"
            value={text}
            onChange={(event) => onChangeText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onConfirm();
            }}
            className="k-input min-w-0 w-full"
          />
        </label>

        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">{t("pending_annotation.size_label")}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              aria-label={t("pending_annotation.size_decrease")}
              onClick={() => step(-SIZE_STEP_PT)}
            >
              -
            </Button>
            <span className="w-8 text-center tabular-nums">{Math.round(sizePt)}</span>
            <Button
              variant="outline"
              aria-label={t("pending_annotation.size_increase")}
              onClick={() => step(SIZE_STEP_PT)}
            >
              +
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">{t("pending_annotation.color_label")}</span>
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
                    hex.toLowerCase() === colorHex.toLowerCase()
                      ? "#111827"
                      : "var(--color-border)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <label className="flex items-center gap-1">
          <span className="text-[var(--color-text-muted)]">{t("pending_annotation.font_family")}</span>
          <span className="k-select-wrap min-w-0 flex-1">
            <select
              aria-label={t("pending_annotation.font_family")}
              title={t("pending_annotation.font_family_tooltip")}
              value={selectedFamily}
              onChange={(event) =>
                changeFace(event.target.value as StandardTextFamily, style.bold, style.italic)
              }
              className="k-select min-w-0 w-full"
            >
              {STANDARD_TEXT_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </span>
        </label>

        <button
          type="button"
          aria-label={t("pending_annotation.bold")}
          title={t("pending_annotation.bold_tooltip")}
          aria-pressed={style.bold}
          onClick={() => changeFace(selectedFamily, !style.bold, style.italic)}
          className="h-8 w-8 rounded border border-[var(--color-border)] bg-[var(--color-background)] font-bold aria-pressed:bg-[var(--color-surface-selected)] aria-pressed:font-bold"
        >
          B
        </button>
        <button
          type="button"
          aria-label={t("pending_annotation.italic")}
          title={t("pending_annotation.italic_tooltip")}
          aria-pressed={style.italic}
          onClick={() => changeFace(selectedFamily, style.bold, !style.italic)}
          className="h-8 w-8 rounded border border-[var(--color-border)] bg-[var(--color-background)] italic aria-pressed:bg-[var(--color-surface-selected)] aria-pressed:font-bold"
        >
          I
        </button>
        <button
          type="button"
          aria-label={t("pending_annotation.underline")}
          title={t("pending_annotation.underline_tooltip")}
          aria-pressed={style.underline}
          onClick={() => changeStyle({ underline: !style.underline })}
          className="h-8 w-8 rounded border border-[var(--color-border)] bg-[var(--color-background)] underline aria-pressed:bg-[var(--color-surface-selected)] aria-pressed:font-bold"
        >
          U
        </button>
        <button
          type="button"
          aria-label={t("pending_annotation.strikethrough")}
          title={t("pending_annotation.strikethrough_tooltip")}
          aria-pressed={style.strikethrough}
          onClick={() => changeStyle({ strikethrough: !style.strikethrough })}
          className="h-8 w-8 rounded border border-[var(--color-border)] bg-[var(--color-background)] line-through aria-pressed:bg-[var(--color-surface-selected)] aria-pressed:font-bold"
        >
          S
        </button>

        <div
          role="group"
          aria-label={t("pending_annotation.horizontal_alignment")}
          className="flex"
        >
          {horizontalAlignments.map(({ value, abbreviation, label, tooltip }) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={tooltip}
              aria-pressed={style.align === value}
              onClick={() => changeStyle({ align: value })}
              className="h-8 min-w-8 border border-[var(--color-border)] bg-[var(--color-background)] px-1 first:rounded-l last:rounded-r aria-pressed:bg-[var(--color-surface-selected)] aria-pressed:font-bold"
            >
              {abbreviation}
            </button>
          ))}
        </div>

        <div role="group" aria-label={t("pending_annotation.vertical_alignment")} className="flex">
          {verticalAlignments.map(({ value, abbreviation, label, tooltip }) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={tooltip}
              aria-pressed={style.vertical_align === value}
              onClick={() => changeStyle({ vertical_align: value })}
              className="h-8 min-w-8 border border-[var(--color-border)] bg-[var(--color-background)] px-1 first:rounded-l last:rounded-r aria-pressed:bg-[var(--color-surface-selected)] aria-pressed:font-bold"
            >
              {abbreviation}
            </button>
          ))}
        </div>

        <Button className="ml-auto" onClick={onConfirm}>
          {t("pending_annotation.confirm")}
        </Button>
        <Button variant="outline" onClick={onDelete}>
          {t("pending_annotation.delete")}
        </Button>
      </div>
    </div>
  );
}
