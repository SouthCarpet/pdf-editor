// Phase 14 Task 73 — Pipeline DAG.
//
// Each `NodeKind` variant carries the full configuration of the matching
// standalone tool — Delta U mandates that pipeline node config reuses the
// same surface as the standalone tools, so the Rust payload mirrors the
// command argument structs as closely as possible. Variant tags (`#[serde
// (tag = "type", rename_all = "snake_case")]`) match the xyflow node-type
// strings on the frontend (`compress`, `optimize`, `unlock`, ...).
//
// `Pipeline::topo_order()` returns a Kahn's-algorithm topological order
// and rejects cycles with `anyhow::bail!("pipeline has a cycle")`.

use serde::{Deserialize, Serialize};

use crate::sidecars::ghostscript::CompressionPreset;

/// Compress preset alias used inside the pipeline payload. Mirrors the
/// `CompressionPresetDto` exported from `commands::compress` but is owned
/// here so the pipeline DAG type lives in `pipeline::dag` and the command
/// layer can `From<...>` into the sidecar's `CompressionPreset`.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum NodeCompressPreset {
    Recommended,
    High,
    Maximum,
    /// Delta U custom path — the executor uses `custom_quality` and
    /// `custom_dpi` from the parent NodeKind variant if the preset is
    /// `Custom`. (Default fallback maps to Recommended when both Custom
    /// fields are None.)
    Custom,
}

impl From<NodeCompressPreset> for CompressionPreset {
    fn from(p: NodeCompressPreset) -> Self {
        match p {
            NodeCompressPreset::Recommended | NodeCompressPreset::Custom => {
                CompressionPreset::Recommended
            }
            NodeCompressPreset::High => CompressionPreset::High,
            NodeCompressPreset::Maximum => CompressionPreset::Maximum,
        }
    }
}

/// Mirrors `commands::convert_export::ExportFormat` but lives in the
/// pipeline module so the DAG type is self-contained and the executor
/// can `From<...>` into the convert layer.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum NodeExportFormat {
    Png,
    Jpg,
    Tiff,
    Txt,
    Html,
    Docx,
    Odt,
    Rtf,
    Epub,
    Pdfa,
}

/// Mirrors `services::ocr_engine::OcrOutputMode`.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum NodeOcrOutputMode {
    SearchablePdf,
    PdfPlusText,
    TextOnly,
}

/// Delta U (Phase 17 Task 86a) — Compress color-mode knob.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeCompressColorMode {
    #[default]
    Preserve,
    Grayscale,
    Monochrome,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeCompressFilter {
    #[default]
    Auto,
    Jpeg,
    Jpeg2000,
    Flate,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeCompressDownsample {
    Subsample,
    Average,
    #[default]
    Bicubic,
}

/// Delta U — PDF/A engine preference shared by Convert + Optimize nodes.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodePdfaEngine {
    #[default]
    Auto,
    Libreoffice,
    Ghostscript,
}

/// Delta U — Crop "apply to" radio.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeCropApplyTo {
    Current,
    #[default]
    All,
    Odd,
    Even,
    Range,
}

/// Delta U — Convert raster color mode.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeRasterColorMode {
    #[default]
    Rgb,
    Rgba,
    Grayscale,
    Mono,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeTiffCompression {
    None,
    #[default]
    Lzw,
    Deflate,
    Jpeg,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "kebab-case")]
pub enum NodeTxtEncoding {
    #[default]
    #[serde(rename = "utf-8")]
    Utf8,
    #[serde(rename = "utf-16le")]
    Utf16Le,
    #[serde(rename = "windows-1250")]
    Windows1250,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "kebab-case")]
pub enum NodeTxtLayout {
    #[default]
    None,
    PerLine,
    PerBlock,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "kebab-case")]
pub enum NodePageBreakBehavior {
    #[default]
    MatchPdf,
    Auto,
    Continuous,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "kebab-case")]
pub enum NodeImportPageSize {
    #[default]
    A4,
    Letter,
    Legal,
    AutoFit,
    Custom,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeImportOrientation {
    Portrait,
    Landscape,
    #[default]
    Auto,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeImportMargins {
    None,
    #[default]
    #[serde(rename = "10mm")]
    TenMm,
    #[serde(rename = "20mm")]
    TwentyMm,
    Custom,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeImportImageFit {
    #[default]
    Fit,
    Fill,
    Center,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type, Default)]
#[serde(rename_all = "kebab-case")]
pub enum NodeImportArrangement {
    #[default]
    OnePerPage,
    Grid2x2,
    Grid2x3,
    Custom,
}

/// Delta U — Optimize strip-metadata per-field flags.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type)]
pub struct StripMetadataFieldsDto {
    #[serde(default = "default_true")]
    pub title: bool,
    #[serde(default = "default_true")]
    pub author: bool,
    #[serde(default = "default_true")]
    pub subject: bool,
    #[serde(default = "default_true")]
    pub keywords: bool,
    #[serde(default = "default_true")]
    pub creator: bool,
    #[serde(default = "default_true")]
    pub producer: bool,
    #[serde(default = "default_true")]
    pub creation_date: bool,
    #[serde(default = "default_true")]
    pub mod_date: bool,
}

impl Default for StripMetadataFieldsDto {
    fn default() -> Self {
        Self {
            title: true,
            author: true,
            subject: true,
            keywords: true,
            creator: true,
            producer: true,
            creation_date: true,
            mod_date: true,
        }
    }
}

// ----- Default helpers for `#[serde(default = "...")]` -----

fn default_true() -> bool {
    true
}
fn default_subset_min_percent() -> u8 {
    95
}
fn default_object_streams_level() -> u8 {
    9
}
fn default_ocr_dpi() -> u32 {
    300
}
fn default_raster_dpi() -> u32 {
    150
}
fn default_jpeg_quality() -> u8 {
    85
}
fn default_page_range() -> String {
    "all".to_string()
}
fn default_txt_page_separator() -> String {
    "\n\u{000c}\n".to_string()
}
fn default_pdfa_version() -> u8 {
    2
}
fn default_a4_width_mm() -> f32 {
    210.0
}
fn default_a4_height_mm() -> f32 {
    297.0
}
fn default_margin_mm() -> f32 {
    10.0
}
fn default_one_f32() -> f32 {
    1.0
}
fn default_crop_threshold() -> u8 {
    240
}

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NodeKind {
    /// Compress via Ghostscript. Preset + optional custom_quality (1-100)
    /// + custom_dpi for Custom preset path.
    ///
    /// Delta U Phase 17 Task 86a — color_dpi/gray_dpi/mono_dpi/color_mode/
    /// filter/downsample/remove_exif extend the Custom path; they survive
    /// over the FFI even if GhostscriptWrapper does not yet honor every
    /// knob (forward-compat).
    Compress {
        preset: NodeCompressPreset,
        custom_quality: Option<u8>,
        custom_dpi: Option<u16>,
        #[serde(default)]
        color_dpi: Option<u16>,
        #[serde(default)]
        gray_dpi: Option<u16>,
        #[serde(default)]
        mono_dpi: Option<u16>,
        #[serde(default)]
        color_mode: NodeCompressColorMode,
        #[serde(default)]
        filter: NodeCompressFilter,
        #[serde(default)]
        downsample: NodeCompressDownsample,
        #[serde(default)]
        remove_exif: bool,
    },
    /// Full Optimize pipeline (mirrors `OptimizeArgs`).
    ///
    /// Delta U Phase 17 Task 86a — sub-option fields per checkbox.
    Optimize {
        linearize: bool,
        remove_unused: bool,
        subset_fonts: bool,
        #[serde(default = "default_subset_min_percent")]
        subset_min_percent: u8,
        object_streams: bool,
        #[serde(default = "default_object_streams_level")]
        object_streams_level: u8,
        strip_metadata: bool,
        #[serde(default)]
        strip_metadata_fields: StripMetadataFieldsDto,
        flatten_annotations: bool,
        #[serde(default)]
        flatten_include_forms: bool,
        remove_form_data: bool,
        make_searchable_ocr: Option<String>,
        #[serde(default = "default_ocr_dpi")]
        ocr_dpi: u32,
        convert_pdfa: Option<u8>,
        #[serde(default)]
        pdfa_engine: NodePdfaEngine,
    },
    /// Decrypt via qpdf (Delta D: V=5 in-process AES-256 is deferred —
    /// pipeline currently funnels through the same qpdf-only path as the
    /// standalone Unlock tool).
    Unlock { password: Option<String> },
    /// Convert export — LibreOffice for office targets, mutool for raster,
    /// Ghostscript+LO for PDF/A (Delta E).
    ///
    /// Delta U Phase 17 Task 86a — per-format sub-options. They survive
    /// over the FFI; the executor honors what the underlying sidecars
    /// support today.
    Convert {
        format: NodeExportFormat,
        out_dir: Option<String>,
        #[serde(default = "default_raster_dpi")]
        raster_dpi: u32,
        #[serde(default)]
        raster_color_mode: NodeRasterColorMode,
        #[serde(default = "default_jpeg_quality")]
        jpeg_quality: u8,
        #[serde(default)]
        tiff_compression: NodeTiffCompression,
        #[serde(default = "default_page_range")]
        page_range: String,
        #[serde(default)]
        txt_encoding: NodeTxtEncoding,
        #[serde(default)]
        txt_layout: NodeTxtLayout,
        #[serde(default = "default_txt_page_separator")]
        txt_page_separator: String,
        #[serde(default = "default_true")]
        html_single_file: bool,
        #[serde(default)]
        html_embed_images_base64: bool,
        #[serde(default = "default_true")]
        office_preserve_formatting: bool,
        #[serde(default = "default_true")]
        office_embed_images: bool,
        #[serde(default)]
        office_page_break: NodePageBreakBehavior,
        #[serde(default = "default_pdfa_version")]
        pdfa_version: u8,
        #[serde(default)]
        pdfa_engine: NodePdfaEngine,
        #[serde(default = "default_true")]
        pdfa_embed_all_fonts: bool,
    },
    /// Convert images / office documents back into a PDF.
    ///
    /// Delta U Phase 17 Task 86a — page-size / orientation / margins /
    /// image-fit / arrangement extra fields.
    ConvertImport {
        /// Empty = use inputs directly; non-empty = additional files merged
        /// in front of inputs.
        extra_inputs: Vec<String>,
        #[serde(default)]
        page_size: NodeImportPageSize,
        #[serde(default = "default_a4_width_mm")]
        custom_width_mm: f32,
        #[serde(default = "default_a4_height_mm")]
        custom_height_mm: f32,
        #[serde(default)]
        orientation: NodeImportOrientation,
        #[serde(default)]
        margins: NodeImportMargins,
        #[serde(default = "default_margin_mm")]
        custom_margin_mm: f32,
        #[serde(default)]
        image_fit: NodeImportImageFit,
        #[serde(default)]
        arrangement: NodeImportArrangement,
    },
    /// Merge all inputs into a single PDF.
    Merge {},
    /// Split each input into the given inclusive ranges.
    Split { ranges: Vec<[u32; 2]> },
    /// Extract the given page numbers (1-based) into a single PDF.
    Extract { pages: Vec<u32> },
    /// Rotate per (page, angle) tuples.
    OrganizeRotate {
        rotations: Vec<[i64; 2]>, // [page, degrees]
    },
    /// Delete the given page numbers.
    OrganizeDelete { pages: Vec<u32> },
    /// Reorder pages to the given 1-based sequence.
    OrganizeReorder { new_order: Vec<u32> },
    /// Insert a blank page after `after_page_index` (0-based).
    OrganizeInsertBlank {
        after_page_index: u32,
        width: f32,
        height: f32,
    },
    /// Crop via auto-detect or a fixed bbox.
    ///
    /// Delta U Phase 17 Task 86a — aspect_ratio / page_size_preset /
    /// margin_preset / apply_to (which overrides apply_to_all_pages) /
    /// auto_detect_threshold extra fields.
    Crop {
        bbox: Option<[f32; 4]>, // x, y, w, h in PDF points
        auto_detect: bool,
        apply_to_all_pages: bool,
        page_index: u32,
        #[serde(default)]
        aspect_ratio: String,
        #[serde(default = "default_one_f32")]
        aspect_ratio_w: f32,
        #[serde(default = "default_one_f32")]
        aspect_ratio_h: f32,
        #[serde(default)]
        page_size_preset: String,
        #[serde(default)]
        margin_preset: String,
        #[serde(default)]
        margin_custom_mm: f32,
        #[serde(default)]
        apply_to: NodeCropApplyTo,
        #[serde(default)]
        apply_range: String,
        #[serde(default = "default_crop_threshold")]
        auto_detect_threshold: u8,
    },
    /// OCR add-layer (mirrors a subset of `OcrOptions`).
    Ocr {
        language: String,
        dpi: u32,
        output: NodeOcrOutputMode,
        deskew: bool,
        despeckle: bool,
    },
    /// Diagonal text watermark (lopdf overlay).
    Watermark { text: String, opacity: f32 },
    /// Save current files into `dir` using `name_template` (supports
    /// `{stem}`, `{i}`, `{date}`, `{tool}` placeholders).
    Save { dir: String, name_template: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PipelineNode {
    pub id: String,
    pub kind: NodeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PipelineEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Pipeline {
    pub nodes: Vec<PipelineNode>,
    pub edges: Vec<PipelineEdge>,
}

/// Delta Y preflight warning: one is emitted for every edge `(from, to)`
/// where the downstream node `may_strip` an artifact the upstream node
/// `preserves`. The frontend pipeline editor reads this off
/// `PipelineRunReport.warnings` and draws an alert icon on the matching
/// edge so the user can fix the chain before running.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PreservationWarning {
    pub from: String,
    pub to: String,
    /// Names of `Artifact` bits that would be lost. Stable, lowercase
    /// snake_case so the frontend can translate them.
    pub artifacts: Vec<String>,
}

/// One-per-input failure record returned alongside the report.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NodeError {
    pub input: String,
    pub message: String,
}

/// Final result of `pipeline_run_cmd` / `pipeline_run_on_folder_cmd`. The
/// frontend displays `output_paths` in the result table, `errors` in a
/// red panel, and `warnings` (preflight) as inline edge alerts before
/// the run starts.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
pub struct PipelineRunReport {
    pub output_paths: Vec<String>,
    pub success: usize,
    pub failed: usize,
    pub errors: Vec<NodeError>,
    pub warnings: Vec<PreservationWarning>,
}

impl Pipeline {
    /// Kahn's algorithm topological sort. Returns the node IDs in order
    /// of execution. Bails on cycles (executor would otherwise deadlock).
    pub fn topo_order(&self) -> anyhow::Result<Vec<String>> {
        use std::collections::{HashMap, HashSet, VecDeque};
        let mut in_deg: HashMap<&str, usize> =
            self.nodes.iter().map(|n| (n.id.as_str(), 0)).collect();
        for e in &self.edges {
            *in_deg.entry(e.to.as_str()).or_insert(0) += 1;
        }
        let mut q: VecDeque<&str> = in_deg
            .iter()
            .filter(|(_, &d)| d == 0)
            .map(|(k, _)| *k)
            .collect();
        let mut order = Vec::new();
        let mut seen = HashSet::new();
        while let Some(id) = q.pop_front() {
            if !seen.insert(id) {
                continue;
            }
            order.push(id.to_string());
            for e in &self.edges {
                if e.from == id {
                    if let Some(d) = in_deg.get_mut(e.to.as_str()) {
                        *d -= 1;
                        if *d == 0 {
                            q.push_back(e.to.as_str());
                        }
                    }
                }
            }
        }
        if order.len() != self.nodes.len() {
            anyhow::bail!("pipeline has a cycle");
        }
        Ok(order)
    }
}
