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
import { CheckField, SelectField, SliderField, TextField } from "./fields";
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

const RASTER = new Set<ExportFormat>(["png", "jpg", "tiff"]);
const OFFICE = new Set<ExportFormat>(["docx", "odt", "rtf", "epub"]);

type TFn = ReturnType<typeof useTranslation>["t"];
type Setter = <K extends keyof ConvertExportOptionsValue>(
  key: K,
  next: ConvertExportOptionsValue[K]
) => void;

interface SectionProps {
  value: ConvertExportOptionsValue;
  set: Setter;
  t: TFn;
}

const SECTION_CLASS = "space-y-4 border-t border-[var(--color-border)] pt-4";

function formatLabels(t: TFn): Record<ExportFormat, string> {
  return {
    png: t("convert_export.format_png"),
    jpg: t("convert_export.format_jpg"),
    tiff: t("convert_export.format_tiff"),
    txt: t("convert_export.format_txt"),
    html: t("convert_export.format_html"),
    docx: t("convert_export.format_docx"),
    odt: t("convert_export.format_odt"),
    rtf: t("convert_export.format_rtf"),
    epub: t("convert_export.format_epub"),
    pdfa: t("convert_export.format_pdfa"),
  };
}

function PageRangeField({ value, set, t }: SectionProps) {
  const all = t("convert_export.page_range_all");
  return (
    <TextField label={t("convert_export.page_range")}>
      <input
        type="text"
        className="k-input"
        value={value.pageRange === "all" ? all : value.pageRange}
        onChange={(e) => set("pageRange", e.target.value === all ? "all" : e.target.value)}
        placeholder={t("convert_export.page_range_placeholder")}
        aria-label={t("convert_export.page_range")}
      />
    </TextField>
  );
}

function RasterSection({ value, set, t }: SectionProps) {
  const f = value.format;
  return (
    <div className={SECTION_CLASS}>
      <SliderField
        label={t("convert_export.raster_dpi")}
        value={value.rasterDpi}
        min={72}
        max={600}
        unit="dpi"
        onChange={(v) => set("rasterDpi", v)}
      />
      <SelectField
        label={t("convert_export.raster_color_mode")}
        value={value.rasterColorMode}
        onChange={(v) => set("rasterColorMode", v as RasterColorMode)}
      >
        <option value="rgb">{t("convert_export.raster_color_rgb")}</option>
        <option value="rgba">{t("convert_export.raster_color_rgba")}</option>
        <option value="grayscale">{t("convert_export.raster_color_grayscale")}</option>
        <option value="mono">{t("convert_export.raster_color_monochrome")}</option>
      </SelectField>
      {f === "jpg" && (
        <SliderField
          label={t("convert_export.raster_quality")}
          value={value.jpegQuality}
          min={1}
          max={100}
          onChange={(v) => set("jpegQuality", v)}
        />
      )}
      {f === "tiff" && (
        <SelectField
          label={t("convert_export.tiff_compression")}
          value={value.tiffCompression}
          onChange={(v) => set("tiffCompression", v as TiffCompression)}
        >
          <option value="none">{t("convert_export.txt_layout_none")}</option>
          <option value="lzw">LZW</option>
          <option value="deflate">Deflate</option>
          <option value="jpeg">JPEG</option>
        </SelectField>
      )}
      <PageRangeField value={value} set={set} t={t} />
    </div>
  );
}

function TxtSection({ value, set, t }: SectionProps) {
  return (
    <div className={SECTION_CLASS}>
      <SelectField
        label={t("convert_export.txt_encoding")}
        value={value.txtEncoding}
        onChange={(v) => set("txtEncoding", v as TxtEncoding)}
      >
        <option value="utf-8">UTF-8</option>
        <option value="utf-16le">UTF-16 LE</option>
        <option value="windows-1250">Windows-1250</option>
      </SelectField>
      <SelectField
        label={t("convert_export.txt_layout")}
        value={value.txtLayout}
        onChange={(v) => set("txtLayout", v as TxtLayout)}
      >
        <option value="none">{t("convert_export.txt_layout_none")}</option>
        <option value="per-line">{t("convert_export.txt_layout_per_line")}</option>
        <option value="per-block">{t("convert_export.txt_layout_per_block")}</option>
      </SelectField>
      <TextField label={t("convert_export.txt_page_separator")}>
        <input
          type="text"
          className="k-input"
          value={value.txtPageSeparator}
          onChange={(e) => set("txtPageSeparator", e.target.value)}
          placeholder="\\n\\f\\n"
          aria-label={t("convert_export.txt_page_separator")}
        />
      </TextField>
    </div>
  );
}

function HtmlSection({ value, set, t }: SectionProps) {
  return (
    <div className={SECTION_CLASS}>
      <CheckField
        label={t("convert_export.html_split")}
        checked={!value.htmlSingleFile}
        onChange={(c) => set("htmlSingleFile", !c)}
      />
      <CheckField
        label={t("convert_export.html_embed_images")}
        checked={value.htmlEmbedImagesBase64}
        onChange={(c) => set("htmlEmbedImagesBase64", c)}
      />
    </div>
  );
}

function OfficeSection({ value, set, t }: SectionProps) {
  return (
    <div className={SECTION_CLASS}>
      <CheckField
        label={t("convert_export.office_preserve_formatting")}
        checked={value.officePreserveFormatting}
        onChange={(c) => set("officePreserveFormatting", c)}
      />
      <CheckField
        label={t("convert_export.office_embed_images")}
        checked={value.officeEmbedImages}
        onChange={(c) => set("officeEmbedImages", c)}
      />
      <SelectField
        label={t("convert_export.office_page_breaks")}
        value={value.officePageBreak}
        onChange={(v) => set("officePageBreak", v as PageBreakBehavior)}
      >
        <option value="match-pdf">{t("convert_export.page_break_match")}</option>
        <option value="auto">{t("convert_export.page_break_auto")}</option>
        <option value="continuous">{t("convert_export.page_break_continuous")}</option>
      </SelectField>
    </div>
  );
}

function PdfaSection({ value, set, t }: SectionProps) {
  return (
    <div className={SECTION_CLASS}>
      <SelectField
        label={t("convert_export.pdfa_version")}
        value={String(value.pdfaVersion)}
        onChange={(v) => set("pdfaVersion", Number(v) as 1 | 2 | 3)}
      >
        <option value={1}>1b</option>
        <option value={2}>2b/2u</option>
        <option value={3}>3b</option>
      </SelectField>
      <SelectField
        label={t("convert_export.pdfa_engine")}
        value={value.pdfaEngine}
        onChange={(v) => set("pdfaEngine", v as PdfaEngine)}
      >
        <option value="auto">{t("optimize.pdfa_engine_auto")}</option>
        <option value="libreoffice">LibreOffice</option>
        <option value="ghostscript">Ghostscript</option>
      </SelectField>
      <CheckField
        label={t("convert_export.pdfa_embed_fonts")}
        checked={value.pdfaEmbedAllFonts}
        onChange={(c) => set("pdfaEmbedAllFonts", c)}
      />
    </div>
  );
}

interface Props {
  value: ConvertExportOptionsValue;
  onChange: (next: ConvertExportOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function ConvertExportOptions({ value, onChange }: Props) {
  const { t } = useTranslation("tools");
  const set: Setter = (key, next) => onChange({ ...value, [key]: next });
  const labels = formatLabels(t);
  const f = value.format;
  return (
    <div className="space-y-4">
      <SelectField
        label={t("convert_export.format")}
        value={value.format}
        onChange={(v) => set("format", v as ExportFormat)}
      >
        {FORMATS.map((format) => (
          <option key={format} value={format}>
            {labels[format]}
          </option>
        ))}
      </SelectField>
      {RASTER.has(f) && <RasterSection value={value} set={set} t={t} />}
      {f === "txt" && <TxtSection value={value} set={set} t={t} />}
      {f === "html" && <HtmlSection value={value} set={set} t={t} />}
      {OFFICE.has(f) && <OfficeSection value={value} set={set} t={t} />}
      {f === "pdfa" && <PdfaSection value={value} set={set} t={t} />}
    </div>
  );
}
