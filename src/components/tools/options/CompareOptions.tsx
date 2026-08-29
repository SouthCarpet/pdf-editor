// Delta U (Phase 17 Task 86a) - reusable Compare options panel.
//
// Used by:
//   - ComparePanel (workspace Compare tool) - embeds this on top of the
//     left/right file pickers so the user can dial in DPI/tolerance/diff
//     style before running.
//   - Future pipeline Compare node - when wired in a follow-up phase.
//
// Visual options: DPI 72-300 slider, tolerance 0-10%, diff color picker,
// view mode (Side-by-side / Overlay / Difference-only).
// Text options: word boundary toggle, ignore case, ignore whitespace,
// min change unit (Char / Word / Sentence), diff style (Inline /
// Side-by-side / Unified).
import { useTranslation } from "react-i18next";
import type {
  CompareDiffStyle,
  CompareDiffUnit,
  CompareMode,
  CompareOptionsValue,
  CompareView,
} from "./defaults";
export { DEFAULT_COMPARE_OPTIONS } from "./defaults";
export type { CompareOptionsValue } from "./defaults";

interface Props {
  value: CompareOptionsValue;
  onChange: (next: CompareOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function CompareOptions({ value, onChange }: Props) {
  const { t } = useTranslation("workspace");
  const modeLabels: Record<CompareMode, string> = {
    visual: t("compare.options.visual"),
    text: t("compare.options.text"),
  };
  function set<K extends keyof CompareOptionsValue>(
    key: K,
    next: CompareOptionsValue[K],
  ) {
    onChange({ ...value, [key]: next });
  }
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <fieldset className="flex gap-3" aria-label={t("compare.options.mode")}>
        {(["visual", "text"] as CompareMode[]).map((m) => (
          <label key={m} className="flex items-center gap-1 text-xs">
            <input
              type="radio"
              name="compare-mode"
              checked={value.mode === m}
              onChange={() => set("mode", m)}
            />
            {modeLabels[m]}
          </label>
        ))}
      </fieldset>

      {value.mode === "visual" && (
        <div className="space-y-2 rounded border p-2 text-xs">
          <label className="block">
            {t("compare.options.dpi")}: {value.visualDpi}
            <input
              type="range"
              min={72}
              max={300}
              value={value.visualDpi}
              onChange={(e) => set("visualDpi", Number(e.target.value))}
              className="w-full"
              aria-label={t("compare.options.visual_dpi")}
            />
          </label>
          <label className="block">
            {t("compare.options.tolerance")}: {value.visualTolerancePercent}%
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={value.visualTolerancePercent}
              onChange={(e) =>
                set("visualTolerancePercent", Number(e.target.value))
              }
              className="w-full"
              aria-label={t("compare.options.visual_tolerance")}
            />
          </label>
          <label className="flex items-center gap-2">
            {t("compare.options.diff_color")}
            <input
              type="color"
              value={value.visualDiffColor}
              onChange={(e) => set("visualDiffColor", e.target.value)}
              aria-label={t("compare.options.diff_color")}
            />
          </label>
          <label className="block">
            {t("compare.options.view_mode")}
            <select
              value={value.visualView}
              onChange={(e) =>
                set("visualView", e.target.value as CompareView)
              }
              className="h-7 w-full rounded border px-2"
              aria-label={t("compare.options.visual_view_mode")}
            >
              <option value="side-by-side">{t("compare.options.side_by_side")}</option>
              <option value="overlay">{t("compare.options.overlay")}</option>
              <option value="difference-only">{t("compare.options.difference_only")}</option>
            </select>
          </label>
        </div>
      )}

      {value.mode === "text" && (
        <div className="space-y-2 rounded border p-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.textWordBoundary}
              onChange={(e) => set("textWordBoundary", e.target.checked)}
            />
            {t("compare.options.word_boundary")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.textIgnoreCase}
              onChange={(e) => set("textIgnoreCase", e.target.checked)}
            />
            {t("compare.options.ignore_case")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.textIgnoreWhitespace}
              onChange={(e) =>
                set("textIgnoreWhitespace", e.target.checked)
              }
            />
            {t("compare.options.ignore_whitespace")}
          </label>
          <label className="block">
            {t("compare.options.min_change_unit")}
            <select
              value={value.textMinChangeUnit}
              onChange={(e) =>
                set("textMinChangeUnit", e.target.value as CompareDiffUnit)
              }
              className="h-7 w-full rounded border px-2"
              aria-label={t("compare.options.min_change_unit")}
            >
              <option value="char">{t("compare.options.character")}</option>
              <option value="word">{t("compare.options.word")}</option>
              <option value="sentence">{t("compare.options.sentence")}</option>
            </select>
          </label>
          <label className="block">
            {t("compare.options.diff_style")}
            <select
              value={value.textDiffStyle}
              onChange={(e) =>
                set("textDiffStyle", e.target.value as CompareDiffStyle)
              }
              className="h-7 w-full rounded border px-2"
              aria-label={t("compare.options.diff_style")}
            >
              <option value="inline">{t("compare.options.inline")}</option>
              <option value="side-by-side">{t("compare.options.side_by_side")}</option>
              <option value="unified">{t("compare.options.unified")}</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
