// Delta U: reusable Crop options panel. The workspace CropPanel drives
// this through a drag-rect overlay; the pipeline node uses the same
// schema with text-driven inputs.
//
// Phase 17 Task 86a — extended surface:
//   aspect-ratio lock (Free / 1:1 / 4:3 / 16:9 / A4 / Letter / Custom)
//   preset crop sizes dropdown (A3/A4/A5/Letter/Legal/Tabloid/Custom)
//   margin presets + custom mm input
//   live W x H readout in selected unit (pt / mm / in)
//   "Apply to" radio: Current / All / Odd / Even / Range
//   auto-detect threshold slider under "Advanced ▾"
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type {
  AspectRatio,
  CropApplyTo,
  CropOptionsValue,
  CropUnit,
  MarginPreset,
  PageSizePreset,
} from "./defaults";
export { DEFAULT_CROP_OPTIONS } from "./defaults";
export type { CropOptionsValue } from "./defaults";

interface Props {
  value: CropOptionsValue;
  onChange: (next: CropOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

const PT_PER_MM = 72 / 25.4;
const PT_PER_IN = 72;

function ptToUnit(pt: number, unit: CropUnit): string {
  if (unit === "mm") return (pt / PT_PER_MM).toFixed(1) + " mm";
  if (unit === "in") return (pt / PT_PER_IN).toFixed(2) + " in";
  return pt.toFixed(0) + " pt";
}

export function CropOptions({ value, onChange }: Props) {
  function set<K extends keyof CropOptionsValue>(
    key: K,
    next: CropOptionsValue[K],
  ) {
    onChange({ ...value, [key]: next });
  }
  const [advanced, setAdvanced] = useState(false);
  const w = value.bbox?.[2] ?? 0;
  const h = value.bbox?.[3] ?? 0;

  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.auto_detect}
          onChange={(e) => set("auto_detect", e.target.checked)}
        />
        Auto-detect bbox
      </label>

      <div className="space-y-1">
        <label className="text-xs text-[var(--color-muted)]">Aspect ratio</label>
        <select
          value={value.aspect_ratio}
          onChange={(e) => set("aspect_ratio", e.target.value as AspectRatio)}
          className="h-8 w-full rounded border px-2 text-xs"
          aria-label="Aspect ratio"
        >
          <option value="free">Free</option>
          <option value="1:1">1:1</option>
          <option value="4:3">4:3</option>
          <option value="16:9">16:9</option>
          <option value="a4-portrait">A4 portrait</option>
          <option value="a4-landscape">A4 landscape</option>
          <option value="letter-portrait">Letter portrait</option>
          <option value="letter-landscape">Letter landscape</option>
          <option value="custom">Custom</option>
        </select>
        {value.aspect_ratio === "custom" && (
          <div className="mt-1 grid grid-cols-2 gap-1">
            <Input
              type="number"
              min={1}
              value={value.aspect_ratio_w}
              onChange={(e) =>
                set("aspect_ratio_w", Number(e.target.value) || 1)
              }
              placeholder="W"
              aria-label="Aspect ratio width"
            />
            <Input
              type="number"
              min={1}
              value={value.aspect_ratio_h}
              onChange={(e) =>
                set("aspect_ratio_h", Number(e.target.value) || 1)
              }
              placeholder="H"
              aria-label="Aspect ratio height"
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[var(--color-muted)]">Preset size</label>
        <select
          value={value.page_size_preset}
          onChange={(e) =>
            set("page_size_preset", e.target.value as PageSizePreset)
          }
          className="h-8 w-full rounded border px-2 text-xs"
          aria-label="Page size preset"
        >
          <option value="custom">Custom</option>
          <option value="a3">A3</option>
          <option value="a4">A4</option>
          <option value="a5">A5</option>
          <option value="letter">Letter</option>
          <option value="legal">Legal</option>
          <option value="tabloid">Tabloid</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[var(--color-muted)]">Margins</label>
        <select
          value={value.margin_preset}
          onChange={(e) =>
            set("margin_preset", e.target.value as MarginPreset)
          }
          className="h-8 w-full rounded border px-2 text-xs"
          aria-label="Margin preset"
        >
          <option value="none">None</option>
          <option value="tight">Tight (0.25 in)</option>
          <option value="standard">Standard (0.5 in)</option>
          <option value="loose">Loose (1 in)</option>
          <option value="custom">Custom (mm)</option>
        </select>
        {value.margin_preset === "custom" && (
          <Input
            type="number"
            min={0}
            value={value.margin_custom_mm}
            onChange={(e) =>
              set("margin_custom_mm", Number(e.target.value) || 0)
            }
            placeholder="mm"
            aria-label="Custom margin mm"
          />
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[var(--color-muted)]">Unit</label>
        <select
          value={value.unit}
          onChange={(e) => set("unit", e.target.value as CropUnit)}
          className="h-8 w-full rounded border px-2 text-xs"
          aria-label="Unit"
        >
          <option value="pt">Points (pt)</option>
          <option value="mm">Millimeters (mm)</option>
          <option value="in">Inches (in)</option>
        </select>
        <p className="text-xs text-[var(--color-muted)]">
          Live: {ptToUnit(w, value.unit)} x {ptToUnit(h, value.unit)}
        </p>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-xs text-[var(--color-muted)]">Apply to</legend>
        {(["current", "all", "odd", "even", "range"] as CropApplyTo[]).map(
          (val) => (
            <label key={val} className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="crop-apply-to"
                value={val}
                checked={value.apply_to === val}
                onChange={() => {
                  set("apply_to", val);
                  set("apply_to_all_pages", val === "all");
                }}
              />
              {val === "current"
                ? "Current page"
                : val === "all"
                  ? "All pages"
                  : val === "odd"
                    ? "Odd pages"
                    : val === "even"
                      ? "Even pages"
                      : "Range"}
            </label>
          ),
        )}
        {value.apply_to === "range" && (
          <Input
            type="text"
            value={value.apply_range}
            onChange={(e) => set("apply_range", e.target.value)}
            placeholder="1-5, 8, 10"
            aria-label="Page range"
          />
        )}
      </fieldset>

      <label className="block">
        Sample page index (0-based, used for auto-detect):
        <Input
          type="number"
          min={0}
          value={value.page_index}
          onChange={(e) => set("page_index", Number(e.target.value))}
          aria-label="Sample page index"
        />
      </label>

      {!value.auto_detect && (
        <div className="space-y-1">
          <p className="text-[var(--color-muted)]">
            Manual bbox x, y, w, h (PDF points):
          </p>
          <Input
            type="text"
            value={value.bbox?.join(", ") ?? ""}
            onChange={(e) => {
              const parts = e.target.value
                .split(",")
                .map((s) => Number(s.trim()));
              if (parts.length === 4 && parts.every(Number.isFinite)) {
                set("bbox", parts as [number, number, number, number]);
              } else {
                set("bbox", null);
              }
            }}
            placeholder="36, 36, 540, 720"
            aria-label="Bbox"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        className="text-xs text-[var(--color-muted)] hover:underline"
        aria-label="Toggle advanced options"
      >
        {advanced ? "Hide advanced" : "Advanced"}
      </button>
      {advanced && (
        <div className="rounded border p-2">
          <label className="block text-xs">
            Auto-detect threshold: {value.auto_detect_threshold}
            <input
              type="range"
              min={0}
              max={255}
              value={value.auto_detect_threshold}
              onChange={(e) =>
                set("auto_detect_threshold", Number(e.target.value))
              }
              className="w-full"
              aria-label="Auto-detect threshold"
            />
          </label>
        </div>
      )}
    </div>
  );
}
