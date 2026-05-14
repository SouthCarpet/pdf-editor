// Delta U: reusable Optimize options panel — shared between OptimizeTool
// (standalone page) and the pipeline NodeConfigPanel.
//
// Phase 17 Task 86a — expand each checkbox with its own sub-options:
//   subset_fonts -> min-glyph-% slider
//   object_streams -> Flate compression level 1-9
//   strip_metadata -> individual field checkboxes
//   flatten_annotations -> include-form-fields toggle
//   ocr -> language + DPI
//   pdfa -> version + engine
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  OptimizeOptionsValue,
  PdfaEngine,
  StripMetadataFields,
} from "./defaults";

export type { OptimizeOptionsValue } from "./defaults";
export { DEFAULT_OPTIMIZE_OPTIONS } from "./defaults";

interface Props {
  value: OptimizeOptionsValue;
  onChange: (next: OptimizeOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

const STRIP_FIELDS: Array<[keyof StripMetadataFields, string]> = [
  ["title", "Title"],
  ["author", "Author"],
  ["subject", "Subject"],
  ["keywords", "Keywords"],
  ["creator", "Creator"],
  ["producer", "Producer"],
  ["creation_date", "Creation date"],
  ["mod_date", "Modification date"],
];

export function OptimizeOptions({ value, onChange }: Props) {
  function set<K extends keyof OptimizeOptionsValue>(
    key: K,
    next: OptimizeOptionsValue[K],
  ) {
    onChange({ ...value, [key]: next });
  }
  function setStripField(k: keyof StripMetadataFields, v: boolean) {
    onChange({
      ...value,
      strip_metadata_fields: { ...value.strip_metadata_fields, [k]: v },
    });
  }
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (k: string) =>
    setExpanded((e) => ({ ...e, [k]: !e[k] }));

  return (
    <div className="space-y-2 rounded border p-3">
      {/* Linearize — no sub-options */}
      <Row
        label="Linearize (fast web view)"
        checked={value.linearize}
        onChange={(v) => set("linearize", v)}
      />
      {/* Remove unused */}
      <Row
        label="Remove unused resources"
        checked={value.remove_unused}
        onChange={(v) => set("remove_unused", v)}
      />
      {/* Subset fonts */}
      <Row
        label="Subset embedded fonts"
        checked={value.subset_fonts}
        onChange={(v) => set("subset_fonts", v)}
        expandable
        expanded={expanded.subset}
        onToggle={() => toggle("subset")}
      />
      {value.subset_fonts && expanded.subset && (
        <SubBox>
          <label className="block text-xs">
            Subset if fewer than {value.subset_min_percent}% of glyphs used
            <input
              type="range"
              min={50}
              max={100}
              value={value.subset_min_percent}
              onChange={(e) =>
                set("subset_min_percent", Number(e.target.value))
              }
              className="w-full"
              aria-label="Subset minimum percent"
            />
          </label>
        </SubBox>
      )}
      {/* Object streams */}
      <Row
        label="Object stream compression"
        checked={value.object_streams}
        onChange={(v) => set("object_streams", v)}
        expandable
        expanded={expanded.objs}
        onToggle={() => toggle("objs")}
      />
      {value.object_streams && expanded.objs && (
        <SubBox>
          <label className="block text-xs">
            Flate compression level: {value.object_streams_level}
            <input
              type="range"
              min={1}
              max={9}
              value={value.object_streams_level}
              onChange={(e) =>
                set("object_streams_level", Number(e.target.value))
              }
              className="w-full"
              aria-label="Flate level"
            />
          </label>
        </SubBox>
      )}
      {/* Flatten annotations */}
      <Row
        label="Flatten annotations"
        checked={value.flatten_annotations}
        onChange={(v) => set("flatten_annotations", v)}
        expandable
        expanded={expanded.flatten}
        onToggle={() => toggle("flatten")}
      />
      {value.flatten_annotations && expanded.flatten && (
        <SubBox>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={value.flatten_include_forms}
              onCheckedChange={(v) => set("flatten_include_forms", Boolean(v))}
            />
            Include form fields when flattening
          </label>
        </SubBox>
      )}
      {/* Strip metadata */}
      <Row
        label="Strip metadata"
        checked={value.strip_metadata}
        onChange={(v) => set("strip_metadata", v)}
        expandable
        expanded={expanded.strip}
        onToggle={() => toggle("strip")}
      />
      {value.strip_metadata && expanded.strip && (
        <SubBox>
          <div className="grid grid-cols-2 gap-1">
            {STRIP_FIELDS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={value.strip_metadata_fields[k]}
                  onCheckedChange={(v) => setStripField(k, Boolean(v))}
                />
                {label}
              </label>
            ))}
          </div>
        </SubBox>
      )}
      {/* Remove form data */}
      <Row
        label="Remove form data"
        checked={value.remove_form_data}
        onChange={(v) => set("remove_form_data", v)}
      />
      {/* OCR */}
      <Row
        label="Make searchable (OCR)"
        checked={value.ocr}
        onChange={(v) => set("ocr", v)}
        expandable
        expanded={expanded.ocr}
        onToggle={() => toggle("ocr")}
      />
      {value.ocr && expanded.ocr && (
        <SubBox>
          <label className="block text-xs">
            Language:
            <input
              type="text"
              value={value.ocr_lang}
              onChange={(e) => set("ocr_lang", e.target.value)}
              className="ml-2 h-7 w-32 rounded border px-2 text-xs"
              aria-label="OCR language"
            />
          </label>
          <label className="block text-xs">
            DPI: {value.ocr_dpi}
            <input
              type="range"
              min={200}
              max={600}
              step={50}
              value={value.ocr_dpi}
              onChange={(e) => set("ocr_dpi", Number(e.target.value))}
              className="w-full"
              aria-label="OCR DPI"
            />
          </label>
        </SubBox>
      )}
      {/* PDF/A */}
      <Row
        label="Convert to PDF/A"
        checked={value.pdfa}
        onChange={(v) => set("pdfa", v)}
        expandable
        expanded={expanded.pdfa}
        onToggle={() => toggle("pdfa")}
      />
      {value.pdfa && expanded.pdfa && (
        <SubBox>
          <label className="block text-xs">
            Version:
            <select
              value={value.pdfa_version}
              onChange={(e) => set("pdfa_version", Number(e.target.value))}
              className="ml-2 h-7 rounded border px-2 text-xs"
              aria-label="PDF/A version"
            >
              <option value={1}>1b</option>
              <option value={2}>2b</option>
              <option value={3}>2u</option>
              <option value={4}>3b</option>
            </select>
          </label>
          <label className="block text-xs">
            Engine:
            <select
              value={value.pdfa_engine}
              onChange={(e) =>
                set("pdfa_engine", e.target.value as PdfaEngine)
              }
              className="ml-2 h-7 rounded border px-2 text-xs"
              aria-label="PDF/A engine"
            >
              <option value="auto">Auto</option>
              <option value="libreoffice">LibreOffice</option>
              <option value="ghostscript">Ghostscript</option>
            </select>
          </label>
        </SubBox>
      )}
    </div>
  );
}

function Row({
  label,
  checked,
  onChange,
  expandable,
  expanded,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onChange(Boolean(v))}
        />
        <span>{label}</span>
      </label>
      {expandable && (
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-[var(--color-muted)] hover:underline"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${label} options`}
        >
          {expanded ? "Hide" : "Advanced"}
        </button>
      )}
    </div>
  );
}

function SubBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-6 space-y-2 rounded border bg-[var(--color-card)] p-2">
      {children}
    </div>
  );
}
