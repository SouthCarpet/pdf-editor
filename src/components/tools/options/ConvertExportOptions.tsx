// Delta U: reusable Convert Export options panel shared between
// ConvertExportTool and the pipeline NodeConfigPanel.
//
// Phase 17 Task 86a: per-format sub-options shown beneath the format
// selector. Raster (PNG/JPG/TIFF) exposes DPI, color mode, quality
// (JPG), TIFF compression, and page range. TXT exposes encoding,
// layout preservation, and page separator. HTML exposes single-file vs
// split + embed-images base64. Office targets (DOCX/ODT/RTF/EPUB)
// expose preserve-formatting + embed-images + page-break behavior.
// PDF/A exposes version, engine preference, and embed-all-fonts.
import type { ExportFormat } from "@/bindings";
import { useTranslation } from "react-i18next";
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

const FORMATS: ExportFormat[] = [
  "png",
  "jpg",
  "tiff",
  "txt",
  "html",
  "docx",
  "odt",
  "rtf",
  "epub",
  "pdfa",
];

function formatLabel(t: ReturnType<typeof useTranslation>["t"], format: ExportFormat) {
  switch (format) {
    case "png":
      return t("convert_export.format_png");
    case "jpg":
      return t("convert_export.format_jpg");
    case "tiff":
      return t("convert_export.format_tiff");
    case "txt":
      return t("convert_export.format_txt");
    case "html":
      return t("convert_export.format_html");
    case "docx":
      return t("convert_export.format_docx");
    case "odt":
      return t("convert_export.format_odt");
    case "rtf":
      return t("convert_export.format_rtf");
    case "epub":
      return t("convert_export.format_epub");
    case "pdfa":
      return t("convert_export.format_pdfa");
  }
}

interface Props {
  value: ConvertExportOptionsValue;
  onChange: (next: ConvertExportOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function ConvertExportOptions({ value, onChange }: Props) {
  const { t } = useTranslation("tools");
  function set<K extends keyof ConvertExportOptionsValue>(
    key: K,
    next: ConvertExportOptionsValue[K]
  ) {
    onChange({ ...value, [key]: next });
  }
  const f = value.format;
  const isRaster = f === "png" || f === "jpg" || f === "tiff";
  const isOffice = f === "docx" || f === "odt" || f === "rtf" || f === "epub";
  return (
    <div className="space-y-2">
      <label className="text-sm text-[var(--color-muted)]">{t("convert_export.format")}</label>
      <select
        value={value.format}
        onChange={(e) => set("format", e.target.value as ExportFormat)}
        className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-control)] px-3 text-sm text-[var(--color-control-foreground)]"
        aria-label={t("convert_export.format")}
      >
        {FORMATS.map((format) => (
          <option key={format} value={format}>
            {formatLabel(t, format)}
          </option>
        ))}
      </select>

      {isRaster && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="block">
            {t("convert_export.raster_dpi")}: {value.rasterDpi}
            <input
              type="range"
              min={72}
              max={600}
              value={value.rasterDpi}
              onChange={(e) => set("rasterDpi", Number(e.target.value))}
              className="w-full"
              aria-label={t("convert_export.raster_dpi")}
            />
          </label>
          <label className="block">
            {t("convert_export.raster_color_mode")}
            <select
              value={value.rasterColorMode}
              onChange={(e) => set("rasterColorMode", e.target.value as RasterColorMode)}
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.raster_color_mode")}
            >
              <option value="rgb">{t("convert_export.raster_color_rgb")}</option>
              <option value="rgba">{t("convert_export.raster_color_rgba")}</option>
              <option value="grayscale">{t("convert_export.raster_color_grayscale")}</option>
              <option value="mono">{t("convert_export.raster_color_monochrome")}</option>
            </select>
          </label>
          {f === "jpg" && (
            <label className="block">
              {t("convert_export.raster_quality")}: {value.jpegQuality}
              <input
                type="range"
                min={1}
                max={100}
                value={value.jpegQuality}
                onChange={(e) => set("jpegQuality", Number(e.target.value))}
                className="w-full"
                aria-label={t("convert_export.raster_quality")}
              />
            </label>
          )}
          {f === "tiff" && (
            <label className="block">
              {t("convert_export.tiff_compression")}
              <select
                value={value.tiffCompression}
                onChange={(e) => set("tiffCompression", e.target.value as TiffCompression)}
                className="h-7 w-full rounded border px-2"
                aria-label={t("convert_export.tiff_compression")}
              >
                <option value="none">{t("convert_export.txt_layout_none")}</option>
                <option value="lzw">LZW</option>
                <option value="deflate">Deflate</option>
                <option value="jpeg">JPEG</option>
              </select>
            </label>
          )}
          <label className="block">
            {t("convert_export.page_range")}:
            <input
              type="text"
              value={
                value.pageRange === "all"
                  ? t("convert_export.page_range_all")
                  : value.pageRange
              }
              onChange={(e) =>
                set(
                  "pageRange",
                  e.target.value === t("convert_export.page_range_all")
                    ? "all"
                    : e.target.value,
                )
              }
              placeholder={t("convert_export.page_range_placeholder")}
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.page_range")}
            />
          </label>
        </div>
      )}

      {f === "txt" && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="block">
            {t("convert_export.txt_encoding")}
            <select
              value={value.txtEncoding}
              onChange={(e) => set("txtEncoding", e.target.value as TxtEncoding)}
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.txt_encoding")}
            >
              <option value="utf-8">UTF-8</option>
              <option value="utf-16le">UTF-16 LE</option>
              <option value="windows-1250">Windows-1250</option>
            </select>
          </label>
          <label className="block">
            {t("convert_export.txt_layout")}
            <select
              value={value.txtLayout}
              onChange={(e) => set("txtLayout", e.target.value as TxtLayout)}
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.txt_layout")}
            >
              <option value="none">{t("convert_export.txt_layout_none")}</option>
              <option value="per-line">{t("convert_export.txt_layout_per_line")}</option>
              <option value="per-block">{t("convert_export.txt_layout_per_block")}</option>
            </select>
          </label>
          <label className="block">
            {t("convert_export.txt_page_separator")}
            <input
              type="text"
              value={value.txtPageSeparator}
              onChange={(e) => set("txtPageSeparator", e.target.value)}
              placeholder="\\n\\f\\n"
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.txt_page_separator")}
            />
          </label>
        </div>
      )}

      {f === "html" && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!value.htmlSingleFile}
              onChange={(e) => set("htmlSingleFile", !e.target.checked)}
            />
            {t("convert_export.html_split")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.htmlEmbedImagesBase64}
              onChange={(e) => set("htmlEmbedImagesBase64", e.target.checked)}
            />
            {t("convert_export.html_embed_images")}
          </label>
        </div>
      )}

      {isOffice && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.officePreserveFormatting}
              onChange={(e) => set("officePreserveFormatting", e.target.checked)}
            />
            {t("convert_export.office_preserve_formatting")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.officeEmbedImages}
              onChange={(e) => set("officeEmbedImages", e.target.checked)}
            />
            {t("convert_export.office_embed_images")}
          </label>
          <label className="block">
            {t("convert_export.office_page_breaks")}
            <select
              value={value.officePageBreak}
              onChange={(e) => set("officePageBreak", e.target.value as PageBreakBehavior)}
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.office_page_breaks")}
            >
              <option value="match-pdf">{t("convert_export.page_break_match")}</option>
              <option value="auto">{t("convert_export.page_break_auto")}</option>
              <option value="continuous">{t("convert_export.page_break_continuous")}</option>
            </select>
          </label>
        </div>
      )}

      {f === "pdfa" && (
        <div className="space-y-2 rounded border p-3 text-xs">
          <label className="block">
            {t("convert_export.pdfa_version")}
            <select
              value={value.pdfaVersion}
              onChange={(e) => set("pdfaVersion", Number(e.target.value) as 1 | 2 | 3)}
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.pdfa_version")}
            >
              <option value={1}>1b</option>
              <option value={2}>2b/2u</option>
              <option value={3}>3b</option>
            </select>
          </label>
          <label className="block">
            {t("convert_export.pdfa_engine")}
            <select
              value={value.pdfaEngine}
              onChange={(e) => set("pdfaEngine", e.target.value as PdfaEngine)}
              className="h-7 w-full rounded border px-2"
              aria-label={t("convert_export.pdfa_engine")}
            >
              <option value="auto">{t("optimize.pdfa_engine_auto")}</option>
              <option value="libreoffice">LibreOffice</option>
              <option value="ghostscript">Ghostscript</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.pdfaEmbedAllFonts}
              onChange={(e) => set("pdfaEmbedAllFonts", e.target.checked)}
            />
            {t("convert_export.pdfa_embed_fonts")}
          </label>
        </div>
      )}
    </div>
  );
}
