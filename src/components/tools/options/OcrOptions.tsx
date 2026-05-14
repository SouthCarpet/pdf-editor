// Delta U: reusable OCR options panel. The workspace tools/OcrTool drives
// this with i18n + a language picker tied to list_ocr_languages; the
// pipeline node embeds the same component for parity.
import { Input } from "@/components/ui/input";

export type OcrOutputMode = "searchable_pdf" | "pdf_plus_text" | "text_only";

export interface OcrOptionsValue {
  language: string;
  dpi: number;
  output: OcrOutputMode;
  deskew: boolean;
  despeckle: boolean;
}

export const DEFAULT_OCR_OPTIONS: OcrOptionsValue = {
  language: "eng",
  dpi: 300,
  output: "searchable_pdf",
  deskew: true,
  despeckle: false,
};

interface Props {
  value: OcrOptionsValue;
  onChange: (next: OcrOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function OcrOptions({ value, onChange }: Props) {
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <label className="block">
        Language (e.g. <code>eng</code>, <code>eng+slk</code>):
        <Input
          type="text"
          value={value.language}
          onChange={(e) => onChange({ ...value, language: e.target.value })}
          placeholder="eng"
        />
      </label>
      <label className="block">
        DPI:
        <Input
          type="number"
          min={72}
          max={600}
          step={6}
          value={value.dpi}
          onChange={(e) => onChange({ ...value, dpi: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        Output mode:
        <select
          value={value.output}
          onChange={(e) =>
            onChange({ ...value, output: e.target.value as OcrOutputMode })
          }
          className="ml-2 h-8 rounded border px-2"
        >
          <option value="searchable_pdf">Searchable PDF</option>
          <option value="pdf_plus_text">PDF + .txt sidecar</option>
          <option value="text_only">Text only</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.deskew}
          onChange={(e) => onChange({ ...value, deskew: e.target.checked })}
        />
        Deskew (correct tilted scans)
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.despeckle}
          onChange={(e) => onChange({ ...value, despeckle: e.target.checked })}
        />
        Despeckle (remove specks)
      </label>
    </div>
  );
}
