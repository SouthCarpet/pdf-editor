// Delta U: reusable Crop options panel. The workspace CropPanel drives
// this through a drag-rect overlay; the pipeline node uses the same
// schema with text-driven inputs.
//
// Phase 17 Task 86a - extended surface:
//   aspect-ratio lock (Free / 1:1 / 4:3 / 16:9 / A4 / Letter / Custom)
//   preset crop sizes dropdown (A3/A4/A5/Letter/Legal/Tabloid/Custom)
//   margin presets + custom mm input
//   live W x H readout in selected unit (pt / mm / in)
//   "Apply to" radio: Current / All / Odd / Even / Range
//   auto-detect threshold slider under "Advanced ▾"
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { CheckField, RadioField, SelectField, SliderField, TextField } from "./fields";
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

type Setter = <K extends keyof CropOptionsValue>(key: K, next: CropOptionsValue[K]) => void;

interface SectionProps {
  value: CropOptionsValue;
  set: Setter;
}

const APPLY_LABELS: Record<CropApplyTo, string> = {
  current: "Current page",
  all: "All pages",
  odd: "Odd pages",
  even: "Even pages",
  range: "Range",
};

function AspectRatioSection({ value, set }: SectionProps) {
  const { t } = useTranslation("tools");
  return (
    <>
      <SelectField
        label="Aspect ratio"
        value={value.aspect_ratio}
        onChange={(v) => set("aspect_ratio", v as AspectRatio)}
      >
        <option value="free">Free</option>
        <option value="1:1">1:1</option>
        <option value="4:3">4:3</option>
        <option value="16:9">16:9</option>
        <option value="a4-portrait">A4 portrait</option>
        <option value="a4-landscape">A4 landscape</option>
        <option value="letter-portrait">{t("crop.letter_portrait")}</option>
        <option value="letter-landscape">{t("crop.letter_landscape")}</option>
        <option value="custom">Custom</option>
      </SelectField>
      {value.aspect_ratio === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min={1}
            value={value.aspect_ratio_w}
            onChange={(e) => set("aspect_ratio_w", Number(e.target.value) || 1)}
            placeholder="W"
            aria-label={t("crop.aspect_ratio_width")}
          />
          <Input
            type="number"
            min={1}
            value={value.aspect_ratio_h}
            onChange={(e) => set("aspect_ratio_h", Number(e.target.value) || 1)}
            placeholder="H"
            aria-label={t("crop.aspect_ratio_height")}
          />
        </div>
      )}
    </>
  );
}

function MarginSection({ value, set }: SectionProps) {
  const { t } = useTranslation("tools");
  return (
    <>
      <SelectField
        label="Margins"
        value={value.margin_preset}
        onChange={(v) => set("margin_preset", v as MarginPreset)}
      >
        <option value="none">None</option>
        <option value="tight">Tight (0.25 in)</option>
        <option value="standard">Standard (0.5 in)</option>
        <option value="loose">Loose (1 in)</option>
        <option value="custom">Custom (mm)</option>
      </SelectField>
      {value.margin_preset === "custom" && (
        <Input
          type="number"
          min={0}
          value={value.margin_custom_mm}
          onChange={(e) => set("margin_custom_mm", Number(e.target.value) || 0)}
          placeholder={t("crop.unit_mm")}
          aria-label={t("crop.margin_custom_aria")}
        />
      )}
    </>
  );
}

function ApplyToSection({ value, set }: SectionProps) {
  const { t } = useTranslation("tools");
  return (
    <>
      <fieldset className="k-radio-group">
        <legend className="k-label">{t("crop.apply_to")}</legend>
        {(Object.keys(APPLY_LABELS) as CropApplyTo[]).map((val) => (
          <RadioField
            key={val}
            name="crop-apply-to"
            label={APPLY_LABELS[val]}
            checked={value.apply_to === val}
            onChange={() => {
              set("apply_to", val);
              set("apply_to_all_pages", val === "all");
            }}
          />
        ))}
      </fieldset>
      {value.apply_to === "range" && (
        <Input
          type="text"
          value={value.apply_range}
          onChange={(e) => set("apply_range", e.target.value)}
          placeholder={t("crop.range_placeholder")}
          aria-label={t("crop.page_range_aria")}
        />
      )}
    </>
  );
}

function parseBbox(text: string): CropOptionsValue["bbox"] {
  const parts = text.split(",").map((s) => Number(s.trim()));
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return parts as [number, number, number, number];
  }
  return null;
}

function ManualBboxSection({ value, set }: SectionProps) {
  const { t } = useTranslation("tools");
  return (
    <TextField label="Manual bbox x, y, w, h (PDF points)">
      <Input
        type="text"
        value={value.bbox?.join(", ") ?? ""}
        onChange={(e) => set("bbox", parseBbox(e.target.value))}
        placeholder={t("crop.bbox_placeholder")}
        aria-label={t("crop.bbox_aria")}
      />
    </TextField>
  );
}

function AdvancedSection({ value, set }: SectionProps) {
  const { t } = useTranslation("tools");
  const [advanced, setAdvanced] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        className="k-btn k-btn-ghost k-btn-auto"
        aria-expanded={advanced}
        aria-label={t("crop.toggle_advanced")}
      >
        {advanced ? "Hide advanced" : "Advanced"}
      </button>
      {advanced && (
        <SliderField
          label="Auto-detect threshold"
          value={value.auto_detect_threshold}
          min={0}
          max={255}
          onChange={(v) => set("auto_detect_threshold", v)}
        />
      )}
    </>
  );
}

export function CropOptions({ value, onChange }: Props) {
  const { t } = useTranslation("tools");
  const set: Setter = (key, next) => onChange({ ...value, [key]: next });
  const w = value.bbox?.[2] ?? 0;
  const h = value.bbox?.[3] ?? 0;

  return (
    <div className="space-y-4">
      <CheckField
        label="Auto-detect bbox"
        checked={value.auto_detect}
        onChange={(c) => set("auto_detect", c)}
      />

      <AspectRatioSection value={value} set={set} />

      <SelectField
        label="Preset size"
        value={value.page_size_preset}
        onChange={(v) => set("page_size_preset", v as PageSizePreset)}
      >
        <option value="custom">Custom</option>
        <option value="a3">A3</option>
        <option value="a4">A4</option>
        <option value="a5">A5</option>
        <option value="letter">Letter</option>
        <option value="legal">Legal</option>
        <option value="tabloid">Tabloid</option>
      </SelectField>

      <MarginSection value={value} set={set} />

      <SelectField label="Unit" value={value.unit} onChange={(v) => set("unit", v as CropUnit)}>
        <option value="pt">Points (pt)</option>
        <option value="mm">Millimeters (mm)</option>
        <option value="in">Inches (in)</option>
      </SelectField>
      <p className="k-caption k-num">
        Live: {ptToUnit(w, value.unit)} x {ptToUnit(h, value.unit)}
      </p>

      <ApplyToSection value={value} set={set} />

      <TextField label="Sample page index (0-based, used for auto-detect)">
        <Input
          type="number"
          min={0}
          value={value.page_index}
          onChange={(e) => set("page_index", Number(e.target.value))}
          aria-label={t("crop.sample_page_aria")}
        />
      </TextField>

      {!value.auto_detect && <ManualBboxSection value={value} set={set} />}

      <AdvancedSection value={value} set={set} />
    </div>
  );
}
