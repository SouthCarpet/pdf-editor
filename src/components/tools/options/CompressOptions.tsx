// Delta U: reusable Compress options panel.
//
// Used by:
//   - CompressTool (standalone tool page) - wraps this in <ToolPage>
//   - Pipeline NodeConfigPanel (Phase 14 Task 75) - embeds this in the
//     right-hand inspector when a compress node is selected.
//
// Phase 17 Task 86a - when "Custom" is chosen, expose the full Delta U
// surface: per-class DPI sliders (color / gray / mono), color mode,
// filter, downsample method, Remove EXIF toggle.
import { useTranslation } from "react-i18next";
import { CheckField, SelectField, SliderField } from "./fields";
import type {
  CompressColorMode,
  CompressDownsample,
  CompressFilter,
  CompressOptionsValue,
} from "./defaults";
export { DEFAULT_COMPRESS_OPTIONS } from "./defaults";
export type { CompressOptionsValue } from "./defaults";

interface Props {
  value: CompressOptionsValue;
  onChange: (next: CompressOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function CompressOptions({ value, onChange, mode = "standalone" }: Props) {
  const { t } = useTranslation("tools");
  function set<K extends keyof CompressOptionsValue>(key: K, next: CompressOptionsValue[K]) {
    onChange({ ...value, [key]: next });
  }
  const showCustom = value.preset === "custom";
  return (
    <div className="space-y-4">
      <SelectField
        label={t("compress.preset")}
        value={value.preset}
        onChange={(v) => set("preset", v as CompressOptionsValue["preset"])}
      >
        <option value="recommended">{t("compress.preset_recommended")}</option>
        <option value="high">{t("compress.preset_high")}</option>
        <option value="maximum">{t("compress.preset_maximum")}</option>
        <option value="custom">{t("compress.preset_custom")}</option>
      </SelectField>
      {showCustom && (
        <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
          <SliderField
            label={t("compress.jpeg_quality")}
            value={value.customQuality}
            min={1}
            max={100}
            onChange={(v) => set("customQuality", v)}
          />
          <SliderField
            label={t("compress.color_dpi")}
            value={value.colorDpi}
            min={36}
            max={300}
            unit="dpi"
            onChange={(v) => set("colorDpi", v)}
          />
          <SliderField
            label={t("compress.grayscale_dpi")}
            value={value.grayDpi}
            min={36}
            max={300}
            unit="dpi"
            onChange={(v) => set("grayDpi", v)}
          />
          <SliderField
            label={t("compress.mono_dpi")}
            value={value.monoDpi}
            min={72}
            max={600}
            unit="dpi"
            onChange={(v) => set("monoDpi", v)}
          />
          <SelectField
            label={t("compress.color_mode")}
            value={value.colorMode}
            onChange={(v) => set("colorMode", v as CompressColorMode)}
          >
            <option value="preserve">{t("compress.color_preserve")}</option>
            <option value="grayscale">{t("compress.color_grayscale")}</option>
            <option value="monochrome">{t("compress.color_monochrome")}</option>
          </SelectField>
          <SelectField
            label={t("compress.filter")}
            value={value.filter}
            onChange={(v) => set("filter", v as CompressFilter)}
          >
            <option value="auto">Auto</option>
            <option value="jpeg">JPEG</option>
            <option value="jpeg2000">JPEG 2000</option>
            <option value="flate">Flate</option>
          </SelectField>
          <SelectField
            label={t("compress.downsample")}
            value={value.downsample}
            onChange={(v) => set("downsample", v as CompressDownsample)}
          >
            <option value="bicubic">{t("compress.downsample_bicubic")}</option>
            <option value="average">{t("compress.downsample_average")}</option>
            <option value="subsample">{t("compress.downsample_subsample")}</option>
          </SelectField>
          <CheckField
            label={t("compress.remove_exif")}
            checked={value.removeExif}
            onChange={(c) => set("removeExif", c)}
          />
        </div>
      )}
      {mode === "standalone" && <p className="k-caption">{t("compress.tip")}</p>}
    </div>
  );
}
