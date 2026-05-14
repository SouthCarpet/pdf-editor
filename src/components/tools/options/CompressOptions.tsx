// Delta U: reusable Compress options panel.
//
// Used by:
//   - CompressTool (standalone tool page) — wraps this in <ToolPage>
//   - Pipeline NodeConfigPanel (Phase 14 Task 75) — embeds this in the
//     right-hand inspector when a compress node is selected.
//
// `mode = "standalone"` shows the "Save as default" hint; `mode =
// "pipeline-node"` collapses that since pipeline presets persist via
// pipeline_preset_save_cmd.
// Re-export so consumers can pull both the component and the value /
// defaults from the same module (matches the OptimizeOptions /
// SplitOptions pattern). Necessary for CompressTool's existing import.
import type { CompressOptionsValue } from "./defaults";
export { DEFAULT_COMPRESS_OPTIONS } from "./defaults";
export type { CompressOptionsValue } from "./defaults";

interface Props {
  value: CompressOptionsValue;
  onChange: (next: CompressOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function CompressOptions({ value, onChange, mode = "standalone" }: Props) {
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
        <label className="text-sm text-[var(--color-muted)]">Preset</label>
        <select
          value={value.preset}
          onChange={(e) =>
            set("preset", e.target.value as CompressOptionsValue["preset"])
          }
          className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm"
        >
          <option value="recommended">Recommended (balanced)</option>
          <option value="high">High (smaller)</option>
          <option value="maximum">Maximum (smallest)</option>
          <option value="custom">Custom</option>
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
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)]">
              Resolution (DPI): {value.customDpi}
            </label>
            <input
              type="range"
              min={72}
              max={600}
              step={6}
              value={value.customDpi}
              onChange={(e) => set("customDpi", Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      )}
      {mode === "standalone" && (
        <p className="text-xs text-[var(--color-muted)]">
          Tip: choose Custom to override the JPEG quality / DPI used during
          downsampling.
        </p>
      )}
    </div>
  );
}
