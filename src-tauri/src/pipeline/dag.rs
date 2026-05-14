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

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NodeKind {
    /// Compress via Ghostscript. Preset + optional custom_quality (1-100)
    /// + custom_dpi for Custom preset path.
    Compress {
        preset: NodeCompressPreset,
        custom_quality: Option<u8>,
        custom_dpi: Option<u16>,
    },
    /// Full Optimize pipeline (mirrors `OptimizeArgs`).
    Optimize {
        linearize: bool,
        remove_unused: bool,
        subset_fonts: bool,
        object_streams: bool,
        strip_metadata: bool,
        flatten_annotations: bool,
        remove_form_data: bool,
        make_searchable_ocr: Option<String>,
        convert_pdfa: Option<u8>,
    },
    /// Decrypt via qpdf (Delta D: V=5 in-process AES-256 is deferred —
    /// pipeline currently funnels through the same qpdf-only path as the
    /// standalone Unlock tool).
    Unlock {
        password: Option<String>,
    },
    /// Convert export — LibreOffice for office targets, mutool for raster,
    /// Ghostscript+LO for PDF/A (Delta E).
    Convert {
        format: NodeExportFormat,
        out_dir: Option<String>,
    },
    /// Convert images / office documents back into a PDF.
    ConvertImport {
        /// Empty = use inputs directly; non-empty = additional files merged
        /// in front of inputs.
        extra_inputs: Vec<String>,
    },
    /// Merge all inputs into a single PDF.
    Merge {},
    /// Split each input into the given inclusive ranges.
    Split {
        ranges: Vec<[u32; 2]>,
    },
    /// Extract the given page numbers (1-based) into a single PDF.
    Extract {
        pages: Vec<u32>,
    },
    /// Rotate per (page, angle) tuples.
    OrganizeRotate {
        rotations: Vec<[i64; 2]>, // [page, degrees]
    },
    /// Delete the given page numbers.
    OrganizeDelete {
        pages: Vec<u32>,
    },
    /// Reorder pages to the given 1-based sequence.
    OrganizeReorder {
        new_order: Vec<u32>,
    },
    /// Insert a blank page after `after_page_index` (0-based).
    OrganizeInsertBlank {
        after_page_index: u32,
        width: f32,
        height: f32,
    },
    /// Crop via auto-detect or a fixed bbox.
    Crop {
        bbox: Option<[f32; 4]>, // x, y, w, h in PDF points
        auto_detect: bool,
        apply_to_all_pages: bool,
        page_index: u32,
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
    Watermark {
        text: String,
        opacity: f32,
    },
    /// Save current files into `dir` using `name_template` (supports
    /// `{stem}`, `{i}`, `{date}`, `{tool}` placeholders).
    Save {
        dir: String,
        name_template: String,
    },
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
