// Delta U: reusable Convert Export options panel — shared between
// ConvertExportTool and the pipeline NodeConfigPanel.
//
// Phase 17 Task 86a — per-format sub-options shown beneath the format
// selector. Raster (PNG/JPG/TIFF) exposes DPI, color mode, quality
// (JPG), TIFF compression, and page range. TXT exposes encoding,
// layout preservation, and page separator. HTML exposes single-file vs
// split + embed-images base64. Office targets (DOCX/ODT/RTF/EPUB)
// expose preserve-formatting + embed-images + page-break behavior.
// PDF/A exposes version, engine preference, and embed-all-fonts.
import type { ExportFormat } from "@/bindings";
import type {
  ConvertExportOptionsValue,
  PageBreakBehavior,
  PdfaEngine,
  RasterColorMode,
  TiffCompression,
  TxtEncoding,
  TxtLayout,
} from "./defaults";
export { DEFAULT_CONVERT_EXPORT_OPTIONS } from "./defaults";
export type { ConvertExportOptionsValue } from "./defaults";

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
  function set<K extends keyof ConvertExportOptionsValue>(
    key: K,
    next: ConvertExportOptionsValue[K],
  ) {
    onChange({ ...value, [key]: next });
  }
  const f = value.format;
  const isRaster = f === "png" || f === "jpg" || f === "tiff";
  const isOffice = f === "docx" || f === "odt" || f === "rtf" || f === "epub";
  return (
    <div className="space-y-2">
      <label className="text-sm text-[var(--color-muted)]">Output format</label>
      <select
        value={value.format}
        onChange={(e) => set("format", e.target.value as ExportFormat)}
        className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-control)] px-3 text-sm text-[var(--color-control-foreground)]"
        aria-label="Output format"
      >
        {FORMATS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {isRaster && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="block">
            DPI: {value.rasterDpi}
            <input
              type="range"
              min={72}
              max={600}
              value={value.rasterDpi}
              onChange={(e) => set("rasterDpi", Number(e.target.value))}
              className="w-full"
              aria-label="Raster DPI"
            />
          </label>
          <label className="block">
            Color mode
            <select
              value={value.rasterColorMode}
              onChange={(e) =>
                set("rasterColorMode", e.target.value as RasterColorMode)
              }
              className="h-7 w-full rounded border px-2"
              aria-label="Raster color mode"
            >
              <option value="rgb">RGB</option>
              <option value="rgba">RGBA</option>
              <option value="grayscale">Grayscale</option>
              <option value="mono">Monochrome 1-bit</option>
            </select>
          </label>
          {f === "jpg" && (
            <label className="block">
              JPEG quality: {value.jpegQuality}
              <input
                type="range"
                min={1}
                max={100}
                value={value.jpegQuality}
                onChange={(e) => set("jpegQuality", Number(e.target.value))}
                className="w-full"
                aria-label="JPEG quality"
              />
            </label>
          )}
          {f === "tiff" && (
            <label className="block">
              TIFF compression
              <select
                value={value.tiffCompression}
                onChange={(e) =>
                  set("tiffCompression", e.target.value as TiffCompression)
                }
                className="h-7 w-full rounded border px-2"
                aria-label="TIFF compression"
              >
                <option value="none">None</option>
                <option value="lzw">LZW</option>
                <option value="deflate">Deflate</option>
                <option value="jpeg">JPEG</option>
              </select>
            </label>
          )}
          <label className="block">
            Page range:
            <input
              type="text"
              value={value.pageRange}
              onChange={(e) => set("pageRange", e.target.value)}
              placeholder="all, current, or 1-5,8"
              className="h-7 w-full rounded border px-2"
              aria-label="Page range"
            />
          </label>
        </div>
      )}

      {f === "txt" && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="block">
            Encoding
            <select
              value={value.txtEncoding}
              onChange={(e) =>
                set("txtEncoding", e.target.value as TxtEncoding)
              }
              className="h-7 w-full rounded border px-2"
              aria-label="Text encoding"
            >
              <option value="utf-8">UTF-8</option>
              <option value="utf-16le">UTF-16 LE</option>
              <option value="windows-1250">Windows-1250</option>
            </select>
          </label>
          <label className="block">
            Layout preservation
            <select
              value={value.txtLayout}
              onChange={(e) =>
                set("txtLayout", e.target.value as TxtLayout)
              }
              className="h-7 w-full rounded border px-2"
              aria-label="Text layout preservation"
            >
              <option value="none">None</option>
              <option value="per-line">Per-line</option>
              <option value="per-block">Per-block</option>
            </select>
          </label>
          <label className="block">
            Page separator
            <input
              type="text"
              value={value.txtPageSeparator}
              onChange={(e) => set("txtPageSeparator", e.target.value)}
              placeholder="\\n\\f\\n"
              className="h-7 w-full rounded border px-2"
              aria-label="Page separator"
            />
          </label>
        </div>
      )}

      {f === "html" && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.htmlSingleFile}
              onChange={(e) => set("htmlSingleFile", e.target.checked)}
            />
            Single file (vs split per page)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.htmlEmbedImagesBase64}
              onChange={(e) =>
                set("htmlEmbedImagesBase64", e.target.checked)
              }
            />
            Embed images as base64
          </label>
        </div>
      )}

      {isOffice && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.officePreserveFormatting}
              onChange={(e) =>
                set("officePreserveFormatting", e.target.checked)
              }
            />
            Preserve formatting
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.officeEmbedImages}
              onChange={(e) => set("officeEmbedImages", e.target.checked)}
            />
            Embed images
          </label>
          <label className="block">
            Page break behavior
            <select
              value={value.officePageBreak}
              onChange={(e) =>
                set("officePageBreak", e.target.value as PageBreakBehavior)
              }
              className="h-7 w-full rounded border px-2"
              aria-label="Page break behavior"
            >
              <option value="match-pdf">Match PDF</option>
              <option value="auto">Auto</option>
              <option value="continuous">Continuous</option>
            </select>
          </label>
        </div>
      )}

      {f === "pdfa" && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="block">
            Version
            <select
              value={value.pdfaVersion}
              onChange={(e) =>
                set(
                  "pdfaVersion",
                  Number(e.target.value) as 1 | 2 | 3,
                )
              }
              className="h-7 w-full rounded border px-2"
              aria-label="PDF/A version"
            >
              <option value={1}>1b</option>
              <option value={2}>2b/2u</option>
              <option value={3}>3b</option>
            </select>
          </label>
          <label className="block">
            Engine
            <select
              value={value.pdfaEngine}
              onChange={(e) =>
                set("pdfaEngine", e.target.value as PdfaEngine)
              }
              className="h-7 w-full rounded border px-2"
              aria-label="PDF/A engine"
            >
              <option value="auto">Auto</option>
              <option value="libreoffice">LibreOffice</option>
              <option value="ghostscript">Ghostscript</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.pdfaEmbedAllFonts}
              onChange={(e) =>
                set("pdfaEmbedAllFonts", e.target.checked)
              }
            />
            Embed all fonts
          </label>
        </div>
      )}
    </div>
  );
}
