// Shared defaults + types for the per-tool Options components.
// Kept separate from the component files so fast-refresh can boundary
// them cleanly (eslint react-refresh rule).
import type { CompressionPresetDto, ExportFormat } from "@/bindings";

export interface CompressOptionsValue {
  preset: CompressionPresetDto | "custom";
  customQuality: number;
  customDpi: number;
}

export const DEFAULT_COMPRESS_OPTIONS: CompressOptionsValue = {
  preset: "recommended",
  customQuality: 70,
  customDpi: 150,
};

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

export interface UnlockOptionsValue {
  password: string;
}

export const DEFAULT_UNLOCK_OPTIONS: UnlockOptionsValue = {
  password: "",
};

export interface ConvertExportOptionsValue {
  format: ExportFormat;
}

export const DEFAULT_CONVERT_EXPORT_OPTIONS: ConvertExportOptionsValue = {
  format: "png",
};

export interface SplitOptionsValue {
  ranges: Array<{ from: number; to: number }>;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptionsValue = {
  ranges: [{ from: 1, to: 1 }],
};

export interface ExtractOptionsValue {
  pageInput: string;
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptionsValue = {
  pageInput: "1",
};

// Phase 14 Task 75 — Delta U options that ship with the pipeline editor
// (the workspace tools still own the click-driven UX for these in their
// own panels; this is the form-driven equivalent the pipeline nodes use).
export interface CropOptionsValue {
  bbox: [number, number, number, number] | null;
  auto_detect: boolean;
  apply_to_all_pages: boolean;
  page_index: number;
}

export const DEFAULT_CROP_OPTIONS: CropOptionsValue = {
  bbox: null,
  auto_detect: true,
  apply_to_all_pages: true,
  page_index: 0,
};

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
