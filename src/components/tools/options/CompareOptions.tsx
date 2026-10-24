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
import { CheckField, RadioField, SelectField, SliderField, TextField } from "./fields";
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
  function set<K extends keyof CompareOptionsValue>(key: K, next: CompareOptionsValue[K]) {
    onChange({ ...value, [key]: next });
  }
  return (
    <div className="space-y-4">
      <fieldset className="k-radio-group k-radio-group--row" aria-label={t("compare.options.mode")}>
        {(["visual", "text"] as CompareMode[]).map((m) => (
          <RadioField
            key={m}
            name="compare-mode"
            label={modeLabels[m]}
            checked={value.mode === m}
            onChange={() => set("mode", m)}
          />
        ))}
      </fieldset>

      {value.mode === "visual" && (
        <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
          <SliderField
            label={t("compare.options.dpi")}
            ariaLabel={t("compare.options.visual_dpi")}
            value={value.visualDpi}
            min={72}
            max={300}
            onChange={(v) => set("visualDpi", v)}
          />
          <SliderField
            label={t("compare.options.tolerance")}
            ariaLabel={t("compare.options.visual_tolerance")}
            value={value.visualTolerancePercent}
            min={0}
            max={10}
            step={0.5}
            unit="%"
            onChange={(v) => set("visualTolerancePercent", v)}
          />
          <TextField label={t("compare.options.diff_color")}>
            <input
              type="color"
              value={value.visualDiffColor}
              onChange={(e) => set("visualDiffColor", e.target.value)}
              className="h-8 w-12"
            />
          </TextField>
          <SelectField
            label={t("compare.options.view_mode")}
            ariaLabel={t("compare.options.visual_view_mode")}
            value={value.visualView}
            onChange={(v) => set("visualView", v as CompareView)}
          >
            <option value="side-by-side">{t("compare.options.side_by_side")}</option>
            <option value="overlay">{t("compare.options.overlay")}</option>
            <option value="difference-only">{t("compare.options.difference_only")}</option>
          </SelectField>
        </div>
      )}

      {value.mode === "text" && (
        <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
          <CheckField
            label={t("compare.options.word_boundary")}
            checked={value.textWordBoundary}
            onChange={(c) => set("textWordBoundary", c)}
          />
          <CheckField
            label={t("compare.options.ignore_case")}
            checked={value.textIgnoreCase}
            onChange={(c) => set("textIgnoreCase", c)}
          />
          <CheckField
            label={t("compare.options.ignore_whitespace")}
            checked={value.textIgnoreWhitespace}
            onChange={(c) => set("textIgnoreWhitespace", c)}
          />
          <SelectField
            label={t("compare.options.min_change_unit")}
            value={value.textMinChangeUnit}
            onChange={(v) => set("textMinChangeUnit", v as CompareDiffUnit)}
          >
            <option value="char">{t("compare.options.character")}</option>
            <option value="word">{t("compare.options.word")}</option>
            <option value="sentence">{t("compare.options.sentence")}</option>
          </SelectField>
          <SelectField
            label={t("compare.options.diff_style")}
            value={value.textDiffStyle}
            onChange={(v) => set("textDiffStyle", v as CompareDiffStyle)}
          >
            <option value="inline">{t("compare.options.inline")}</option>
            <option value="side-by-side">{t("compare.options.side_by_side")}</option>
            <option value="unified">{t("compare.options.unified")}</option>
          </SelectField>
        </div>
      )}
    </div>
  );
}
