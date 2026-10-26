// Delta U: reusable Optimize options panel shared between OptimizeTool
// (standalone page) and the pipeline NodeConfigPanel.
//
// Phase 17 Task 86a: expand each checkbox with its own sub-options:
//   subset_fonts -> min-glyph-% slider
//   object_streams -> Flate compression level 1-9
//   strip_metadata -> individual field checkboxes
//   flatten_annotations -> include-form-fields toggle
//   ocr -> language + DPI
//   pdfa -> version + engine
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckField, SelectField, SliderField, TextField } from "./fields";
import type { OptimizeOptionsValue, PdfaEngine, StripMetadataFields } from "./defaults";

export type { OptimizeOptionsValue } from "./defaults";
export { DEFAULT_OPTIMIZE_OPTIONS } from "./defaults";

interface Props {
  value: OptimizeOptionsValue;
  onChange: (next: OptimizeOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

const STRIP_FIELDS: Array<[keyof StripMetadataFields, string]> = [
  ["title", "optimize.strip_title"],
  ["author", "optimize.strip_author"],
  ["subject", "optimize.strip_subject"],
  ["keywords", "optimize.strip_keywords"],
  ["creator", "optimize.strip_creator"],
  ["producer", "optimize.strip_producer"],
  ["creation_date", "optimize.strip_creation_date"],
  ["mod_date", "optimize.strip_mod_date"],
];

type Setter = <K extends keyof OptimizeOptionsValue>(key: K, next: OptimizeOptionsValue[K]) => void;
type TFn = ReturnType<typeof useTranslation>["t"];

interface SectionProps {
  value: OptimizeOptionsValue;
  set: Setter;
  t: TFn;
}

function StripFieldsSection({ value, onChange, t }: Omit<SectionProps, "set"> & {
  onChange: (next: OptimizeOptionsValue) => void;
}) {
  function setStripField(k: keyof StripMetadataFields, v: boolean) {
    onChange({
      ...value,
      strip_metadata_fields: { ...value.strip_metadata_fields, [k]: v },
    });
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {STRIP_FIELDS.map(([k, labelKey]) => (
        <CheckField
          key={k}
          label={t(labelKey)}
          checked={value.strip_metadata_fields[k]}
          onChange={(c) => setStripField(k, c)}
        />
      ))}
    </div>
  );
}

function OcrSection({ value, set, t }: SectionProps) {
  return (
    <>
      <TextField label={t("optimize.ocr_language")}>
        <input
          type="text"
          value={value.ocr_lang}
          onChange={(e) => set("ocr_lang", e.target.value)}
          className="k-input"
          aria-label={t("optimize.ocr_language")}
        />
      </TextField>
      <SliderField
        label={t("optimize.ocr_dpi")}
        value={value.ocr_dpi}
        min={200}
        max={600}
        step={50}
        unit="dpi"
        onChange={(v) => set("ocr_dpi", v)}
      />
    </>
  );
}

function PdfaSection({ value, set, t }: SectionProps) {
  return (
    <>
      <SelectField
        label={t("optimize.pdfa_version")}
        value={String(value.pdfa_version)}
        onChange={(v) => set("pdfa_version", Number(v))}
      >
        <option value={1}>1b</option>
        <option value={2}>2b</option>
        <option value={3}>2u</option>
        <option value={4}>3b</option>
      </SelectField>
      <SelectField
        label={t("optimize.pdfa_engine")}
        value={value.pdfa_engine}
        onChange={(v) => set("pdfa_engine", v as PdfaEngine)}
      >
        <option value="auto">{t("optimize.pdfa_engine_auto")}</option>
        <option value="libreoffice">{t("optimize.pdfa_engine_libreoffice")}</option>
        <option value="ghostscript">{t("optimize.pdfa_engine_ghostscript")}</option>
      </SelectField>
    </>
  );
}

export function OptimizeOptions({ value, onChange }: Props) {
  const { t } = useTranslation("tools");
  const set: Setter = (key, next) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-3">
      {/* Linearize has no sub-options. */}
      <Row
        label={t("optimize.linearize")}
        checked={value.linearize}
        onChange={(v) => set("linearize", v)}
      />
      <Row
        label={t("optimize.remove_unused")}
        checked={value.remove_unused}
        onChange={(v) => set("remove_unused", v)}
      />
      <Row
        label={t("optimize.subset_fonts")}
        checked={value.subset_fonts}
        onChange={(v) => set("subset_fonts", v)}
      >
        <SliderField
          label={t("optimize.subset_min_pct")}
          value={value.subset_min_percent}
          min={50}
          max={100}
          unit="%"
          onChange={(v) => set("subset_min_percent", v)}
        />
      </Row>
      <Row
        label={t("optimize.object_streams")}
        checked={value.object_streams}
        onChange={(v) => set("object_streams", v)}
      >
        <SliderField
          label={t("optimize.object_streams_level")}
          value={value.object_streams_level}
          min={1}
          max={9}
          onChange={(v) => set("object_streams_level", v)}
        />
      </Row>
      <Row
        label={t("optimize.flatten_annotations")}
        checked={value.flatten_annotations}
        onChange={(v) => set("flatten_annotations", v)}
      >
        <CheckField
          label={t("optimize.flatten_include_forms")}
          checked={value.flatten_include_forms}
          onChange={(c) => set("flatten_include_forms", c)}
        />
      </Row>
      <Row
        label={t("optimize.strip_metadata")}
        checked={value.strip_metadata}
        onChange={(v) => set("strip_metadata", v)}
      >
        <StripFieldsSection value={value} onChange={onChange} t={t} />
      </Row>
      <Row
        label={t("optimize.remove_form_data")}
        checked={value.remove_form_data}
        onChange={(v) => set("remove_form_data", v)}
      />
      <Row label={t("optimize.ocr")} checked={value.ocr} onChange={(v) => set("ocr", v)}>
        <OcrSection value={value} set={set} t={t} />
      </Row>
      <Row label={t("optimize.pdfa")} checked={value.pdfa} onChange={(v) => set("pdfa", v)}>
        <PdfaSection value={value} set={set} t={t} />
      </Row>
    </div>
  );
}

// A check box row. A row with children is expandable: the children (its
// sub-options) show only while the row is checked and expanded. Sub-options sit
// indented under the row, with no side stripe (slop catalog).
function Row({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation("tools");
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <CheckField label={label} checked={checked} onChange={onChange} />
        {children && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="k-btn k-btn-ghost k-btn-auto"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("optimize.collapse_options", { label })
                : t("optimize.expand_options", { label })
            }
          >
            {expanded ? t("optimize.hide_advanced") : t("optimize.advanced")}
          </button>
        )}
      </div>
      {children && checked && expanded && <div className="ml-7 space-y-4">{children}</div>}
    </>
  );
}
