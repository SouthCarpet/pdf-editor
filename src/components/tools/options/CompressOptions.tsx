// Delta U: reusable Compress options panel.
//
// Used by:
//   - CompressTool (standalone tool page) — wraps this in <ToolPage>
//   - Pipeline NodeConfigPanel (Phase 14 Task 75) — embeds this in the
//     right-hand inspector when a compress node is selected.
//
// Phase 17 Task 86a — when "Custom" is chosen, expose the full Delta U
// surface: per-class DPI sliders (color / gray / mono), color mode,
// filter, downsample method, Remove EXIF toggle.
import { useTranslation } from "react-i18next";
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
  function set<K extends keyof CompressOptionsValue>(
    key: K,
    next: CompressOptionsValue[K],
  ) {
    onChange({ ...value, [key]: next });
  }
  const showCustom = value.preset === "custom";
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm text-[var(--color-muted)]">
          {t("compress.preset")}
        </label>
        <select
          value={value.preset}
          onChange={(e) =>
            set("preset", e.target.value as CompressOptionsValue["preset"])
          }
          className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-control)] px-3 text-sm text-[var(--color-control-foreground)]"
          aria-label={t("compress.preset")}
        >
          <option value="recommended">{t("compress.preset_recommended")}</option>
          <option value="high">{t("compress.preset_high")}</option>
          <option value="maximum">{t("compress.preset_maximum")}</option>
          <option value="custom">{t("compress.preset_custom")}</option>
        </select>
      </div>
      {showCustom && (
        <div className="space-y-2 rounded border p-3">
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              JPEG quality (1-100): {value.customQuality}
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={value.customQuality}
              onChange={(e) => set("customQuality", Number(e.target.value))}
              className="w-full"
              aria-label="JPEG quality"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              Color image DPI (36-300): {value.colorDpi}
            </label>
            <input
              type="range"
              min={36}
              max={300}
              value={value.colorDpi}
              onChange={(e) => set("colorDpi", Number(e.target.value))}
              className="w-full"
              aria-label="Color image DPI"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              Grayscale image DPI (36-300): {value.grayDpi}
            </label>
            <input
              type="range"
              min={36}
              max={300}
              value={value.grayDpi}
              onChange={(e) => set("grayDpi", Number(e.target.value))}
              className="w-full"
              aria-label="Grayscale image DPI"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              Monochrome DPI (72-600): {value.monoDpi}
            </label>
            <input
              type="range"
              min={72}
              max={600}
              value={value.monoDpi}
              onChange={(e) => set("monoDpi", Number(e.target.value))}
              className="w-full"
              aria-label="Monochrome DPI"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              Color mode
            </label>
            <select
              value={value.colorMode}
              onChange={(e) =>
                set("colorMode", e.target.value as CompressColorMode)
              }
              className="h-8 w-full rounded border px-2 text-xs"
              aria-label="Color mode"
            >
              <option value="preserve">Preserve</option>
              <option value="grayscale">Convert to Grayscale</option>
              <option value="monochrome">Convert to Monochrome</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              Compression filter
            </label>
            <select
              value={value.filter}
              onChange={(e) =>
                set("filter", e.target.value as CompressFilter)
              }
              className="h-8 w-full rounded border px-2 text-xs"
              aria-label="Compression filter"
            >
              <option value="auto">Auto</option>
              <option value="jpeg">JPEG</option>
              <option value="jpeg2000">JPEG 2000</option>
              <option value="flate">Flate</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              Downsample method
            </label>
            <select
              value={value.downsample}
              onChange={(e) =>
                set("downsample", e.target.value as CompressDownsample)
              }
              className="h-8 w-full rounded border px-2 text-xs"
              aria-label="Downsample method"
            >
              <option value="bicubic">Bicubic</option>
              <option value="average">Average</option>
              <option value="subsample">Subsample</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={value.removeExif}
              onChange={(e) => set("removeExif", e.target.checked)}
            />
            Remove EXIF metadata from images
          </label>
        </div>
      )}
      {mode === "standalone" && (
        <p className="text-xs text-[var(--color-muted)]">{t("compress.tip")}</p>
      )}
    </div>
  );
}
