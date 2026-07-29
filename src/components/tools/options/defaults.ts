// Shared defaults + types for the per-tool Options components.
// Kept separate from the component files so fast-refresh can boundary
// them cleanly (eslint react-refresh rule).
//
// Phase 17 Task 86a (Delta U extension) — expanded option surface for the
// already-committed tools: Crop, Compress, Optimize, ConvertExport,
// ConvertImport, Compare. Each option value carries the full Delta U
// surface; the Options components below render the new controls in
// "Advanced" disclosures so the existing happy-path UX stays one click
// from the top.
import type { CompressionPresetDto, ExportFormat } from "@/bindings";
import type { OcrEngineId } from "@/hooks/useOcrBackends";

// ----- Compress -----

export type CompressColorMode = "preserve" | "grayscale" | "monochrome";
export type CompressFilter = "jpeg" | "jpeg2000" | "flate" | "auto";
export type CompressDownsample = "subsample" | "average" | "bicubic";

export interface CompressOptionsValue {
  preset: CompressionPresetDto | "custom";
  customQuality: number;
  customDpi: number;
  // Delta U extension fields (advisory; current pipeline forwards them
  // through to the NodeKind payload — the executor honors what
  // GhostscriptWrapper exposes today, the rest survive over the FFI so
  // the UI form persists).
  colorDpi: number;
  grayDpi: number;
  monoDpi: number;
  colorMode: CompressColorMode;
  filter: CompressFilter;
  downsample: CompressDownsample;
  removeExif: boolean;
}

export const DEFAULT_COMPRESS_OPTIONS: CompressOptionsValue = {
  preset: "recommended",
  customQuality: 85,
  customDpi: 150,
  colorDpi: 150,
  grayDpi: 150,
  monoDpi: 300,
  colorMode: "preserve",
  filter: "auto",
  downsample: "bicubic",
  removeExif: false,
};

// ----- Optimize -----

export type PdfaEngine = "auto" | "libreoffice" | "ghostscript";

export interface StripMetadataFields {
  title: boolean;
  author: boolean;
  subject: boolean;
  keywords: boolean;
  creator: boolean;
  producer: boolean;
  creation_date: boolean;
  mod_date: boolean;
}

export const DEFAULT_STRIP_METADATA_FIELDS: StripMetadataFields = {
  title: true,
  author: true,
  subject: true,
  keywords: true,
  creator: true,
  producer: true,
  creation_date: true,
  mod_date: true,
};

export interface OptimizeOptionsValue {
  linearize: boolean;
  remove_unused: boolean;
  subset_fonts: boolean;
  subset_min_percent: number;
  object_streams: boolean;
  object_streams_level: number;
  strip_metadata: boolean;
  strip_metadata_fields: StripMetadataFields;
  flatten_annotations: boolean;
  flatten_include_forms: boolean;
  remove_form_data: boolean;
  ocr: boolean;
  ocr_lang: string;
  ocr_dpi: number;
  pdfa: boolean;
  pdfa_version: number;
  pdfa_engine: PdfaEngine;
}

export const DEFAULT_OPTIMIZE_OPTIONS: OptimizeOptionsValue = {
  linearize: true,
  remove_unused: true,
  subset_fonts: true,
  subset_min_percent: 95,
  object_streams: true,
  object_streams_level: 9,
  strip_metadata: false,
  strip_metadata_fields: DEFAULT_STRIP_METADATA_FIELDS,
  flatten_annotations: false,
  flatten_include_forms: false,
  remove_form_data: false,
  ocr: false,
  ocr_lang: "eng",
  ocr_dpi: 300,
  pdfa: false,
  pdfa_version: 2,
  pdfa_engine: "auto",
};

// ----- Unlock -----

export interface UnlockOptionsValue {
  password: string;
}

export const DEFAULT_UNLOCK_OPTIONS: UnlockOptionsValue = {
  password: "",
};

// ----- Convert Export -----

export type TxtEncoding = "utf-8" | "utf-16le" | "windows-1250";
export type TxtLayout = "none" | "per-line" | "per-block";
export type RasterColorMode = "rgb" | "rgba" | "grayscale" | "mono";
export type TiffCompression = "none" | "lzw" | "deflate" | "jpeg";
export type PageBreakBehavior = "match-pdf" | "auto" | "continuous";

export interface ConvertExportOptionsValue {
  format: ExportFormat;
  // Raster (png/jpg/tiff)
  rasterDpi: number;
  rasterColorMode: RasterColorMode;
  jpegQuality: number;
  tiffCompression: TiffCompression;
  pageRange: string;
  // TXT
  txtEncoding: TxtEncoding;
  txtLayout: TxtLayout;
  txtPageSeparator: string;
  // HTML
  htmlSingleFile: boolean;
  htmlEmbedImagesBase64: boolean;
  // Office targets (docx/odt/rtf/epub)
  officePreserveFormatting: boolean;
  officeEmbedImages: boolean;
  officePageBreak: PageBreakBehavior;
  // PDF/A
  pdfaVersion: 1 | 2 | 3;
  pdfaEngine: PdfaEngine;
  pdfaEmbedAllFonts: boolean;
}

export const DEFAULT_CONVERT_EXPORT_OPTIONS: ConvertExportOptionsValue = {
  format: "png",
  rasterDpi: 150,
  rasterColorMode: "rgb",
  jpegQuality: 85,
  tiffCompression: "lzw",
  pageRange: "all",
  txtEncoding: "utf-8",
  txtLayout: "none",
  txtPageSeparator: "\n\f\n",
  htmlSingleFile: true,
  htmlEmbedImagesBase64: false,
  officePreserveFormatting: true,
  officeEmbedImages: true,
  officePageBreak: "match-pdf",
  pdfaVersion: 2,
  pdfaEngine: "auto",
  pdfaEmbedAllFonts: true,
};

// ----- Convert Import -----

export type ImportPageSize = "a4" | "letter" | "legal" | "auto-fit" | "custom";
export type ImportOrientation = "portrait" | "landscape" | "auto";
export type ImportMargins = "none" | "10mm" | "20mm" | "custom";
export type ImportImageFit = "fit" | "fill" | "center";
export type ImportArrangement = "one-per-page" | "grid-2x2" | "grid-2x3" | "custom";

export interface ConvertImportOptionsValue {
  pageSize: ImportPageSize;
  customWidthMm: number;
  customHeightMm: number;
  orientation: ImportOrientation;
  margins: ImportMargins;
  customMarginMm: number;
  imageFit: ImportImageFit;
  arrangement: ImportArrangement;
}

export const DEFAULT_CONVERT_IMPORT_OPTIONS: ConvertImportOptionsValue = {
  pageSize: "a4",
  customWidthMm: 210,
  customHeightMm: 297,
  orientation: "auto",
  margins: "10mm",
  customMarginMm: 10,
  imageFit: "fit",
  arrangement: "one-per-page",
};

// ----- Split -----

export interface SplitOptionsValue {
  ranges: Array<{ from: number; to: number }>;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptionsValue = {
  ranges: [{ from: 1, to: 1 }],
};

// ----- Extract -----

export interface ExtractOptionsValue {
  pageInput: string;
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptionsValue = {
  pageInput: "1",
};

// ----- Crop -----

export type AspectRatio =
  | "free"
  | "1:1"
  | "4:3"
  | "16:9"
  | "a4-portrait"
  | "a4-landscape"
  | "letter-portrait"
  | "letter-landscape"
  | "custom";

export type PageSizePreset = "a3" | "a4" | "a5" | "letter" | "legal" | "tabloid" | "custom";

export type MarginPreset = "none" | "tight" | "standard" | "loose" | "custom";

export type CropApplyTo = "current" | "all" | "odd" | "even" | "range";

export type CropUnit = "pt" | "mm" | "in";

export interface CropOptionsValue {
  bbox: [number, number, number, number] | null;
  auto_detect: boolean;
  apply_to_all_pages: boolean;
  page_index: number;
  // Delta U extension fields:
  aspect_ratio: AspectRatio;
  aspect_ratio_w: number;
  aspect_ratio_h: number;
  page_size_preset: PageSizePreset;
  margin_preset: MarginPreset;
  margin_custom_mm: number;
  apply_to: CropApplyTo;
  apply_range: string;
  auto_detect_threshold: number;
  unit: CropUnit;
}

export const DEFAULT_CROP_OPTIONS: CropOptionsValue = {
  bbox: null,
  auto_detect: true,
  apply_to_all_pages: true,
  page_index: 0,
  aspect_ratio: "free",
  aspect_ratio_w: 1,
  aspect_ratio_h: 1,
  page_size_preset: "custom",
  margin_preset: "none",
  margin_custom_mm: 0,
  apply_to: "all",
  apply_range: "",
  auto_detect_threshold: 240,
  unit: "pt",
};

// ----- OCR -----

export type OcrOutputMode = "searchable_pdf" | "pdf_plus_text" | "text_only";

export interface OcrOptionsValue {
  engine: OcrEngineId;
  language: string;
  dpi: number;
  output: OcrOutputMode;
  deskew: boolean;
  despeckle: boolean;
}

export const DEFAULT_OCR_OPTIONS: OcrOptionsValue = {
  engine: "tesseract",
  language: "eng",
  dpi: 300,
  output: "searchable_pdf",
  deskew: true,
  despeckle: false,
};

// ----- Organize -----

export interface RotateOptionsValue {
  rotations: Array<[number, number]>;
}

export const DEFAULT_ROTATE_OPTIONS: RotateOptionsValue = { rotations: [] };

export interface DeletePagesOptionsValue {
  pages: number[];
}

export const DEFAULT_DELETE_PAGES_OPTIONS: DeletePagesOptionsValue = {
  pages: [],
};

export interface ReorderOptionsValue {
  new_order: number[];
}

export const DEFAULT_REORDER_OPTIONS: ReorderOptionsValue = { new_order: [] };

export interface InsertBlankOptionsValue {
  after_page_index: number;
  width: number;
  height: number;
}

export const DEFAULT_INSERT_BLANK_OPTIONS: InsertBlankOptionsValue = {
  after_page_index: 0,
  width: 612,
  height: 792,
};

// ----- Annotate -----

export type AnnotateMode =
  | "highlight"
  | "freetext"
  | "square"
  | "strikethrough"
  | "underline"
  | "ink";

export interface AnnotateOptionsValue {
  mode: AnnotateMode;
  annotations_json: string;
  color: string;
  opacity: number;
  stroke_width: number;
}

export const DEFAULT_ANNOTATE_OPTIONS: AnnotateOptionsValue = {
  mode: "highlight",
  annotations_json: "[]",
  color: "#FFFF00",
  opacity: 0.5,
  stroke_width: 2,
};

// ----- Watermark -----

export type WatermarkMode = "text" | "image";
export type WatermarkPosition =
  | "top_left"
  | "top_center"
  | "top_right"
  | "middle_left"
  | "center"
  | "middle_right"
  | "bottom_left"
  | "bottom_center"
  | "bottom_right";

export interface WatermarkOptionsValue {
  watermark_mode: WatermarkMode;
  text: string;
  image_path: string | null;
  font_family: string;
  font_size: number;
  color: string;
  opacity: number;
  rotation: number;
  position: WatermarkPosition;
  page_range: string;
  behind_text: boolean;
}

export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptionsValue = {
  watermark_mode: "text",
  text: "DRAFT",
  image_path: null,
  font_family: "Arial",
  font_size: 48,
  color: "#888888",
  opacity: 0.4,
  rotation: -45,
  position: "center",
  page_range: "all",
  behind_text: false,
};

// ----- Compare -----

export type CompareMode = "visual" | "text";
export type CompareView = "side-by-side" | "overlay" | "difference-only";
export type CompareDiffUnit = "char" | "word" | "sentence";
export type CompareDiffStyle = "inline" | "side-by-side" | "unified";

export interface CompareOptionsValue {
  mode: CompareMode;
  // Visual
  visualDpi: number;
  visualTolerancePercent: number;
  visualDiffColor: string;
  visualView: CompareView;
  // Text
  textWordBoundary: boolean;
  textIgnoreCase: boolean;
  textIgnoreWhitespace: boolean;
  textMinChangeUnit: CompareDiffUnit;
  textDiffStyle: CompareDiffStyle;
}

export const DEFAULT_COMPARE_OPTIONS: CompareOptionsValue = {
  mode: "visual",
  visualDpi: 150,
  visualTolerancePercent: 3,
  visualDiffColor: "#ff0000",
  visualView: "side-by-side",
  textWordBoundary: true,
  textIgnoreCase: false,
  textIgnoreWhitespace: false,
  textMinChangeUnit: "word",
  textDiffStyle: "inline",
};
