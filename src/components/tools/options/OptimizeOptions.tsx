// Delta U: reusable Optimize options panel — shared between OptimizeTool
// (standalone page) and the pipeline NodeConfigPanel.
import { Checkbox } from "@/components/ui/checkbox";

export interface OptimizeOptionsValue {
  linearize: boolean;
  remove_unused: boolean;
  subset_fonts: boolean;
  object_streams: boolean;
  strip_metadata: boolean;
  flatten_annotations: boolean;
  remove_form_data: boolean;
  ocr: boolean;
  ocr_lang: string;
  pdfa: boolean;
  pdfa_version: number;
}

export const DEFAULT_OPTIMIZE_OPTIONS: OptimizeOptionsValue = {
  linearize: true,
  remove_unused: true,
  subset_fonts: true,
  object_streams: true,
  strip_metadata: false,
  flatten_annotations: false,
  remove_form_data: false,
  ocr: false,
  ocr_lang: "eng",
  pdfa: false,
  pdfa_version: 2,
};

const CHECKS: Array<[keyof OptimizeOptionsValue, string]> = [
  ["linearize", "Linearize (fast web view)"],
  ["remove_unused", "Remove unused resources"],
  ["subset_fonts", "Subset embedded fonts"],
  ["object_streams", "Generate object streams"],
  ["flatten_annotations", "Flatten annotations"],
  ["strip_metadata", "Strip metadata"],
  ["remove_form_data", "Remove form data"],
];

interface Props {
  value: OptimizeOptionsValue;
  onChange: (next: OptimizeOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function OptimizeOptions({ value, onChange }: Props) {
  function set<K extends keyof OptimizeOptionsValue>(
    key: K,
    next: OptimizeOptionsValue[K],
  ) {
    onChange({ ...value, [key]: next });
  }
  return (
    <div className="space-y-2 rounded border p-3">
      {CHECKS.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value[k] as boolean}
            onCheckedChange={(v) =>
              set(k, Boolean(v) as OptimizeOptionsValue[typeof k])
            }
          />
          <span>{label}</span>
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.ocr}
          onCheckedChange={(v) => set("ocr", Boolean(v))}
        />
        <span>Make searchable (OCR) — language:</span>
        <input
          type="text"
          value={value.ocr_lang}
          onChange={(e) => set("ocr_lang", e.target.value)}
          disabled={!value.ocr}
          className="ml-2 h-8 w-24 rounded border px-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.pdfa}
          onCheckedChange={(v) => set("pdfa", Boolean(v))}
        />
        <span>Convert to PDF/A — version:</span>
        <select
          value={value.pdfa_version}
          onChange={(e) => set("pdfa_version", Number(e.target.value))}
          disabled={!value.pdfa}
          className="ml-2 h-8 rounded border px-2 text-sm"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
    </div>
  );
}
