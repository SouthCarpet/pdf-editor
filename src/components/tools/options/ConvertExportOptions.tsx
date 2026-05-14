// Delta U: reusable Convert Export options panel — shared between
// ConvertExportTool and the pipeline NodeConfigPanel.
import type { ExportFormat } from "@/bindings";

export interface ConvertExportOptionsValue {
  format: ExportFormat;
}

export const DEFAULT_CONVERT_EXPORT_OPTIONS: ConvertExportOptionsValue = {
  format: "png",
};

const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "png", label: "PNG (one per page)" },
  { value: "jpg", label: "JPG (one per page)" },
  { value: "tiff", label: "TIFF (multi-page)" },
  { value: "txt", label: "Plain text (.txt)" },
  { value: "html", label: "HTML" },
  { value: "docx", label: "Word (.docx)" },
  { value: "odt", label: "OpenDocument Text (.odt)" },
  { value: "rtf", label: "Rich Text (.rtf)" },
  { value: "epub", label: "EPUB" },
  { value: "pdfa", label: "PDF/A" },
];

interface Props {
  value: ConvertExportOptionsValue;
  onChange: (next: ConvertExportOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function ConvertExportOptions({ value, onChange }: Props) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--color-muted)]">Output format</label>
      <select
        value={value.format}
        onChange={(e) =>
          onChange({ format: e.target.value as ExportFormat })
        }
        className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm"
      >
        {FORMATS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}
