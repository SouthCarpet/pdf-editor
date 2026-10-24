// Phase 14 Task 74 — Pipeline executor.
//
// `run_pipeline` topo-sorts the DAG and runs each node in sequence,
// piping outputs from the previous node into the next. Each node calls
// the same service-layer functions / sidecar wrappers as the matching
// standalone tool (Delta U: pipeline node config reuses standalone tool
// surface, and the executor must reuse the same execution surface so the
// behaviour matches bit-for-bit between standalone and pipeline runs).
//
// Cancellation: the caller registers `args.job_id` in the
// `CancellationRegistry`; we poll the token between nodes (a per-node
// long-running sidecar gets the token passed through so it can abort
// mid-call). Progress: emitted between nodes as `(step / total)` ratios.

use crate::app_state::AppState;
use crate::commands::ocr::{recognize_pdf_pages, RecognizedOcrPage};
use crate::error::{AppError, AppResult};
use crate::pipeline::dag::{
    NodeExportFormat, NodeKind, NodeOcrOutputMode, Pipeline, PipelineNode, PreservationWarning,
};
use crate::pipeline::preservation::Artifact;
use crate::services::ocr_engine::{OcrBackend, OcrEngine, OcrOptions, OcrOutputMode};
use crate::services::pdf_editor;
use crate::services::workspace::inspect_document;
use crate::util::progress::ProgressReporter;
use chrono::Utc;
use std::collections::HashMap;
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

/// Delta Y preflight: walk every edge once and emit a warning whenever
/// the downstream node `may_strip` an artifact the upstream node
/// `preserves`. Empty result = clean pipeline. The frontend reads this
/// off `PipelineRunReport.warnings`.
pub fn preflight_warnings(pipeline: &Pipeline) -> Vec<PreservationWarning> {
    // Build id -> kind index so we don't quadratic-search per edge.
    let by_id: HashMap<&str, &NodeKind> = pipeline
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), &n.kind))
        .collect();
    let mut out = Vec::new();
    for edge in &pipeline.edges {
        let (Some(from_kind), Some(to_kind)) =
            (by_id.get(edge.from.as_str()), by_id.get(edge.to.as_str()))
        else {
            continue;
        };
        let from = from_kind.preservation();
        let to = to_kind.preservation();
        let conflict = from.preserves & to.may_strip;
        if !conflict.is_empty() {
            out.push(PreservationWarning {
                from: edge.from.clone(),
                to: edge.to.clone(),
                artifacts: artifact_names(conflict),
            });
        }
    }
    out
}

fn artifact_names(a: Artifact) -> Vec<String> {
    let mut v = Vec::new();
    if a.contains(Artifact::TEXT_LAYER) {
        v.push("text_layer".into());
    }
    if a.contains(Artifact::ANNOTATIONS) {
        v.push("annotations".into());
    }
    if a.contains(Artifact::FORM_FIELDS) {
        v.push("form_fields".into());
    }
    if a.contains(Artifact::BOOKMARKS) {
        v.push("bookmarks".into());
    }
    if a.contains(Artifact::EMBEDDED_FONTS) {
        v.push("embedded_fonts".into());
    }
    if a.contains(Artifact::PDFA_COMPLIANCE) {
        v.push("pdfa_compliance".into());
    }
    if a.contains(Artifact::LINEARIZATION) {
        v.push("linearization".into());
    }
    v
}

/// Run a pipeline over `inputs` and return the final output paths.
///
/// Outputs of node N become inputs of node N+1. If the topology has
/// branches, the linear execution still works because we always consume
/// the full "current_files" list per node; non-linear graphs are out of
/// scope for v1 (the editor UI enforces linear edges).
pub async fn run_pipeline(
    state: &AppState,
    pipeline: &Pipeline,
    inputs: &[PathBuf],
    reporter: &ProgressReporter,
    cancel: CancellationToken,
) -> AppResult<Vec<PathBuf>> {
    pipeline.validate().map_err(|e| AppError::InvalidArgument {
        detail: e.to_string(),
    })?;
    let order = pipeline.topo_order().map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    let scratch = tempfile::tempdir().map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    let mut current_files: Vec<PathBuf> = inputs.to_vec();
    let total = order.len().max(1) as f32;

    reporter.started(Some("pipeline starting".into())).await;

    // Delta Y: log preflight warnings (the run command surfaces them in
    // the report so the frontend can decorate the canvas; we log so the
    // ops logs reflect what the user accepted before running).
    log_preflight_warnings(pipeline);

    for (i, node_id) in order.iter().enumerate() {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let node = find_node(pipeline, node_id)?;
        let label = format!(
            "node {} of {}: {}",
            i + 1,
            order.len(),
            node_label(&node.kind)
        );
        log_node_contract(node, &label);
        reporter.progress(i as f32 / total, Some(label)).await;
        current_files = run_node(
            state,
            &node.kind,
            &current_files,
            scratch.path(),
            cancel.clone(),
            i,
        )
        .await?;
    }
    reporter
        .progress(1.0, Some("pipeline complete".into()))
        .await;
    // The TempDir is dropped here, but we may have copied into it. The
    // Save node copies to a user-chosen dir; for inter-stage outputs that
    // are NOT followed by a Save, we materialize a stable copy in a
    // sibling final-results dir so the paths returned to the caller survive
    // the TempDir cleanup.
    let final_paths = materialize_final(&scratch, &current_files)?;
    Ok(final_paths)
}

fn log_preflight_warnings(pipeline: &Pipeline) {
    for w in preflight_warnings(pipeline) {
        tracing::warn!(
            from = %w.from,
            to = %w.to,
            artifacts = ?w.artifacts,
            "pipeline preflight: downstream node may strip upstream artifact",
        );
    }
}

fn find_node<'a>(pipeline: &'a Pipeline, node_id: &str) -> AppResult<&'a PipelineNode> {
    pipeline
        .nodes
        .iter()
        .find(|n| n.id == node_id)
        .ok_or_else(|| AppError::Internal {
            detail: format!("node {node_id} disappeared after topo sort"),
        })
}

/// Delta Y: trace each node's preservation contract so a post-run
/// investigation can reconstruct what was guaranteed kept vs what
/// was permitted to be stripped on a per-step basis.
fn log_node_contract(node: &PipelineNode, label: &str) {
    let contract = node.kind.preservation();
    tracing::info!(
        node = %node.id,
        label = %label,
        preserves = ?contract.preserves,
        may_strip = ?contract.may_strip,
        "pipeline node preservation contract",
    );
}

fn node_label(kind: &NodeKind) -> &'static str {
    match kind {
        NodeKind::Compress { .. } => "compress",
        NodeKind::Optimize { .. } => "optimize",
        NodeKind::Unlock { .. } => "unlock",
        NodeKind::Convert { .. } => "convert",
        NodeKind::ConvertImport { .. } => "convert_import",
        NodeKind::Merge {} => "merge",
        NodeKind::Split { .. } => "split",
        NodeKind::Extract { .. } => "extract",
        NodeKind::OrganizeRotate { .. } => "organize_rotate",
        NodeKind::OrganizeDelete { .. } => "organize_delete",
        NodeKind::OrganizeReorder { .. } => "organize_reorder",
        NodeKind::OrganizeInsertBlank { .. } => "organize_insert_blank",
        NodeKind::Crop { .. } => "crop",
        NodeKind::Ocr { .. } => "ocr",
        NodeKind::Watermark { .. } => "watermark",
        NodeKind::Save { .. } => "save",
        NodeKind::OpenFile { .. } => "open_file",
    }
}

/// If the last node is anything other than Save, copy results into a
/// sibling permanent directory under the scratch parent so the caller's
/// `Vec<PathBuf>` survives `scratch` being dropped. If the last node was
/// Save, paths already point at user-chosen dirs.
fn materialize_final(scratch: &TempDir, current: &[PathBuf]) -> AppResult<Vec<PathBuf>> {
    // Detect "already saved" by checking if files live outside scratch.
    let scratch_root = scratch.path();
    let mut out = Vec::with_capacity(current.len());
    let any_inside = current.iter().any(|p| p.starts_with(scratch_root));
    if !any_inside {
        return Ok(current.to_vec());
    }
    // Move/copy the files to a persistent sibling dir so we don't lose them.
    // We pick the system temp root (parent of the scratch dir is the same
    // OS temp), and create a uniquely-named subdir.
    let persistent_parent = std::env::temp_dir();
    let stamp = chrono::Utc::now().timestamp_millis();
    let dst_dir = persistent_parent.join(format!("pdf-editor-pipeline-{stamp}"));
    std::fs::create_dir_all(&dst_dir).map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    for src in current {
        if src.starts_with(scratch_root) {
            let name = src.file_name().ok_or_else(|| AppError::Internal {
                detail: format!("missing file name for {}", src.display()),
            })?;
            let dst = dst_dir.join(name);
            std::fs::copy(src, &dst).map_err(|e| AppError::IoError {
                detail: e.to_string(),
            })?;
            out.push(dst);
        } else {
            out.push(src.clone());
        }
    }
    Ok(out)
}

/// Validate the `OpenFile` node's configured paths: each must exist on disk
/// and have a `.pdf` extension (case-insensitive). Pulled out of `run_node`
/// so it is unit-testable without an `AppState`.
pub(crate) fn resolve_open_file_paths(paths: &[String]) -> AppResult<Vec<PathBuf>> {
    if paths.is_empty() {
        return Err(AppError::InvalidArgument {
            detail: "open_file: no file selected".into(),
        });
    }

    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        let path = PathBuf::from(p);
        let is_pdf = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("pdf"))
            .unwrap_or(false);
        if !is_pdf {
            return Err(AppError::InvalidArgument {
                detail: format!("open_file: {p} is not a .pdf file"),
            });
        }
        inspect_document(&path)?;
        out.push(path);
    }
    Ok(out)
}

/// Everything one node needs from its surroundings.
struct NodeCtx<'a> {
    state: &'a AppState,
    inputs: &'a [PathBuf],
    scratch: &'a Path,
    cancel: CancellationToken,
    node_idx: usize,
}

impl NodeCtx<'_> {
    /// `<scratch>/<prefix>_<node>_<input>.pdf`
    fn scratch_pdf(&self, prefix: &str, input_idx: usize) -> PathBuf {
        self.scratch
            .join(format!("{prefix}_{}_{input_idx}.pdf", self.node_idx))
    }
}

/// Runs a blocking PDF job off the async runtime and maps both failure
/// layers (join error, job error) to `AppError::Internal`.
async fn run_blocking<T: Send + 'static>(
    job: impl FnOnce() -> anyhow::Result<T> + Send + 'static,
) -> AppResult<T> {
    tokio::task::spawn_blocking(job)
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })
}

/// Applies `op(input, output)` on a blocking thread to every input and
/// returns the produced `<prefix>_<node>_<input>.pdf` paths.
async fn map_inputs_blocking<F>(ctx: &NodeCtx<'_>, prefix: &str, op: F) -> AppResult<Vec<PathBuf>>
where
    F: Fn(&Path, &Path) -> anyhow::Result<()> + Clone + Send + 'static,
{
    let mut outs = Vec::new();
    for (i, src) in ctx.inputs.iter().enumerate() {
        let out = ctx.scratch_pdf(prefix, i);
        let (src_owned, out_owned, op) = (src.clone(), out.clone(), op.clone());
        run_blocking(move || op(&src_owned, &out_owned)).await?;
        outs.push(out);
    }
    Ok(outs)
}

/// A node's result, boxed so every match arm in `run_node` has one type.
type NodeFuture<'a> =
    std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<Vec<PathBuf>>> + Send + 'a>>;

async fn run_node(
    state: &AppState,
    kind: &NodeKind,
    inputs: &[PathBuf],
    scratch: &Path,
    cancel: CancellationToken,
    node_idx: usize,
) -> AppResult<Vec<PathBuf>> {
    let ctx = NodeCtx {
        state,
        inputs,
        scratch,
        cancel,
        node_idx,
    };
    let running: NodeFuture<'_> = match kind {
        NodeKind::Compress {
            preset,
            custom_quality: _,
            custom_dpi: _,
            // Delta U extension fields — survive over FFI; advisory until
            // GhostscriptWrapper grows knobs for them.
            color_dpi: _,
            gray_dpi: _,
            mono_dpi: _,
            color_mode: _,
            filter: _,
            downsample: _,
            remove_exif: _,
        } => Box::pin(run_compress_node(&ctx, (*preset).into())),
        NodeKind::Optimize {
            linearize,
            remove_unused,
            subset_fonts,
            subset_min_percent: _,
            object_streams,
            object_streams_level: _,
            strip_metadata,
            strip_metadata_fields: _,
            flatten_annotations,
            flatten_include_forms: _,
            remove_form_data,
            make_searchable_ocr,
            ocr_dpi: _,
            convert_pdfa,
            pdfa_engine: _,
        } => {
            let stages = OptimizeStages {
                flatten_annotations: *flatten_annotations,
                subset_fonts: *subset_fonts,
                object_streams: *object_streams,
                remove_unused: *remove_unused,
                linearize: *linearize,
                make_searchable_ocr: make_searchable_ocr.is_some(),
                convert_pdfa: *convert_pdfa,
                strip_metadata: *strip_metadata,
                remove_form_data: *remove_form_data,
            };
            Box::pin(run_optimize_node(&ctx, stages))
        }
        NodeKind::Unlock { password } => Box::pin(run_unlock_node(&ctx, password.as_deref())),
        NodeKind::Convert {
            format,
            out_dir,
            raster_dpi: _,
            raster_color_mode: _,
            jpeg_quality: _,
            tiff_compression: _,
            page_range: _,
            txt_encoding: _,
            txt_layout: _,
            txt_page_separator: _,
            html_single_file: _,
            html_embed_images_base64: _,
            office_preserve_formatting: _,
            office_embed_images: _,
            office_page_break: _,
            pdfa_version: _,
            pdfa_engine: _,
            pdfa_embed_all_fonts: _,
        } => Box::pin(run_convert_node(&ctx, format, out_dir.as_deref())),
        NodeKind::ConvertImport {
            extra_inputs,
            page_size: _,
            custom_width_mm: _,
            custom_height_mm: _,
            orientation: _,
            margins: _,
            custom_margin_mm: _,
            image_fit: _,
            arrangement: _,
        } => Box::pin(run_convert_import_node(&ctx, extra_inputs)),
        NodeKind::Merge {} => Box::pin(run_merge_node(&ctx)),
        NodeKind::Split { ranges } => Box::pin(run_split_node(&ctx, ranges)),
        NodeKind::Extract { pages } => Box::pin(run_extract_node(&ctx, pages)),
        NodeKind::OrganizeRotate { rotations } => Box::pin(run_rotate_node(&ctx, rotations)),
        NodeKind::OrganizeDelete { pages } => Box::pin(run_delete_node(&ctx, pages)),
        NodeKind::OrganizeReorder { new_order } => Box::pin(run_reorder_node(&ctx, new_order)),
        NodeKind::OrganizeInsertBlank {
            after_page_index,
            width,
            height,
        } => Box::pin(run_insert_blank_node(
            &ctx,
            *after_page_index,
            *width,
            *height,
        )),
        NodeKind::Crop {
            bbox,
            auto_detect,
            apply_to_all_pages,
            page_index,
            aspect_ratio: _,
            aspect_ratio_w: _,
            aspect_ratio_h: _,
            page_size_preset: _,
            margin_preset: _,
            margin_custom_mm: _,
            apply_to: _,
            apply_range: _,
            auto_detect_threshold,
        } => {
            let spec = CropSpec {
                bbox: *bbox,
                auto_detect: *auto_detect,
                apply_to_all_pages: *apply_to_all_pages,
                page_index: *page_index,
                auto_threshold: *auto_detect_threshold,
            };
            Box::pin(run_crop_node(&ctx, spec))
        }
        NodeKind::Ocr {
            engine,
            language,
            dpi,
            output,
            deskew,
            despeckle,
        } => {
            let opts = ocr_node_options(engine, language, *dpi, output, *deskew, *despeckle);
            Box::pin(run_ocr_node(&ctx, opts))
        }
        NodeKind::Watermark { text, opacity } => {
            Box::pin(std::future::ready(watermark_unimplemented(text, *opacity)))
        }
        NodeKind::OpenFile { paths } => {
            // This node is an explicit source. Configured paths replace
            // ambient command inputs instead of being appended to them.
            Box::pin(std::future::ready(resolve_open_file_paths(paths)))
        }
        NodeKind::Save { dir, name_template } => {
            Box::pin(std::future::ready(run_save_node(&ctx, dir, name_template)))
        }
    };
    running.await
}

fn watermark_unimplemented(text: &str, opacity: f32) -> AppResult<Vec<PathBuf>> {
    // Per non-negotiable rule #1 (no hardcoded fonts in PDF output)
    // and rule #2 (no silent fallback to Standard 14): the Watermark
    // node intentionally surfaces `Unimplemented` until the
    // Watermark tool's font picker (list_fonts_cmd + FontSubsetter)
    // is wired. The standalone Watermark tool does not ship in
    // Phase 14; ship the executor with a clean error sentinel rather
    // than a Helvetica-substitution surprise.
    tracing::warn!(
        "watermark node ({} chars, opacity={}) — Unimplemented until font picker lands",
        text.len(),
        opacity
    );
    Err(AppError::Unimplemented {
        feature: "pipeline.watermark (awaits Watermark tool font picker)".into(),
    })
}

async fn run_extract_node(ctx: &NodeCtx<'_>, pages: &[u32]) -> AppResult<Vec<PathBuf>> {
    let pages = pages.to_vec();
    map_inputs_blocking(ctx, "extract", move |src, out| {
        pdf_editor::extract_pages(src, &pages, out)
    })
    .await
}

async fn run_rotate_node(ctx: &NodeCtx<'_>, rotations: &[[i64; 2]]) -> AppResult<Vec<PathBuf>> {
    let pairs: Vec<(u32, i64)> = rotations.iter().map(|[p, d]| (*p as u32, *d)).collect();
    map_inputs_blocking(ctx, "rotate", move |src, out| {
        pdf_editor::rotate_pages(src, &pairs, out)
    })
    .await
}

async fn run_delete_node(ctx: &NodeCtx<'_>, pages: &[u32]) -> AppResult<Vec<PathBuf>> {
    let pages = pages.to_vec();
    map_inputs_blocking(ctx, "delete", move |src, out| {
        pdf_editor::delete_pages(src, &pages, out)
    })
    .await
}

async fn run_reorder_node(ctx: &NodeCtx<'_>, new_order: &[u32]) -> AppResult<Vec<PathBuf>> {
    let order = new_order.to_vec();
    map_inputs_blocking(ctx, "reorder", move |src, out| {
        pdf_editor::reorder_pages(src, &order, out)
    })
    .await
}

async fn run_insert_blank_node(
    ctx: &NodeCtx<'_>,
    after: u32,
    w: f32,
    h: f32,
) -> AppResult<Vec<PathBuf>> {
    map_inputs_blocking(ctx, "insertblank", move |src, out| {
        pdf_editor::insert_blank_page(src, after, out, w, h)
    })
    .await
}

async fn run_compress_node(
    ctx: &NodeCtx<'_>,
    preset: crate::sidecars::ghostscript::CompressionPreset,
) -> AppResult<Vec<PathBuf>> {
    // Custom quality/dpi are advisory; GhostscriptWrapper::compress
    // doesn't yet take custom knobs (Phase 9 ships preset-only). The
    // pipeline accepts the fields so the UI form survives across the
    // FFI boundary, and a follow-up phase can wire them through.
    let mut outs = Vec::new();
    for (i, src) in ctx.inputs.iter().enumerate() {
        let dst = ctx.scratch_pdf("compress", i);
        ctx.state
            .gs
            .compress(src, &dst, preset, Some(ctx.cancel.clone()))
            .await?;
        outs.push(dst);
    }
    Ok(outs)
}

/// The Optimize node's switches that the pipeline acts on.
struct OptimizeStages {
    flatten_annotations: bool,
    subset_fonts: bool,
    object_streams: bool,
    remove_unused: bool,
    linearize: bool,
    make_searchable_ocr: bool,
    convert_pdfa: Option<u8>,
    strip_metadata: bool,
    remove_form_data: bool,
}

async fn run_optimize_node(ctx: &NodeCtx<'_>, stages: OptimizeStages) -> AppResult<Vec<PathBuf>> {
    let mut outs = Vec::new();
    for (i, src) in ctx.inputs.iter().enumerate() {
        let current = optimize_core_stages(ctx, &stages, src, i).await?;
        outs.push(optimize_finish_stages(ctx, &stages, current, i).await?);
    }
    Ok(outs)
}

async fn optimize_core_stages(
    ctx: &NodeCtx<'_>,
    stages: &OptimizeStages,
    src: &Path,
    i: usize,
) -> AppResult<PathBuf> {
    let state = ctx.state;
    let mut current = src.to_path_buf();
    if stages.flatten_annotations {
        let next = ctx.scratch_pdf("opt_flatten", i);
        state
            .qpdf
            .flatten_annotations(&current, &next, Some(ctx.cancel.clone()))
            .await?;
        current = next;
    }
    if stages.subset_fonts {
        let next = ctx.scratch_pdf("opt_subset", i);
        state
            .mupdf
            .clean_subset_fonts(&current, &next, Some(ctx.cancel.clone()))
            .await?;
        current = next;
    }
    if stages.object_streams || stages.remove_unused {
        let next = ctx.scratch_pdf("opt_os", i);
        state
            .qpdf
            .object_streams_generate(&current, &next, Some(ctx.cancel.clone()))
            .await?;
        current = next;
    }
    if stages.linearize {
        let next = ctx.scratch_pdf("opt_lin", i);
        state
            .qpdf
            .linearize(&current, &next, Some(ctx.cancel.clone()))
            .await?;
        current = next;
    }
    Ok(current)
}

async fn optimize_finish_stages(
    ctx: &NodeCtx<'_>,
    stages: &OptimizeStages,
    mut current: PathBuf,
    i: usize,
) -> AppResult<PathBuf> {
    if stages.make_searchable_ocr {
        warn_ocr_ignored();
    }
    if let Some(version) = stages.convert_pdfa {
        current = optimize_pdfa_stage(ctx, &current, version, i).await?;
    }
    if stages.strip_metadata || stages.remove_form_data {
        current = optimize_strip_stage(ctx, &current, stages, i).await?;
    }
    Ok(current)
}

fn warn_ocr_ignored() {
    // Optimize-stage OCR — Phase 13 wired the full OCR
    // command but Optimize currently elides it (see
    // commands/optimize.rs). Pipeline follows the same
    // policy: log + skip. The user can chain a dedicated
    // OCR node before/after Optimize for the real layer.
    tracing::warn!("pipeline optimize: make_searchable_ocr ignored (use an OCR node instead)");
}

async fn optimize_pdfa_stage(
    ctx: &NodeCtx<'_>,
    current: &Path,
    version: u8,
    i: usize,
) -> AppResult<PathBuf> {
    let lo_target =
        "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}";
    let lo_attempt = ctx
        .state
        .soffice
        .convert(current, ctx.scratch, lo_target, Some(ctx.cancel.clone()))
        .await;
    match lo_attempt {
        Ok(out) => Ok(out),
        Err(_) => {
            let gs_out = ctx.scratch_pdf("opt_pdfa", i);
            ctx.state
                .gs
                .convert_to_pdfa(current, &gs_out, version, Some(ctx.cancel.clone()))
                .await?;
            Ok(gs_out)
        }
    }
}

async fn optimize_strip_stage(
    ctx: &NodeCtx<'_>,
    current: &Path,
    stages: &OptimizeStages,
    i: usize,
) -> AppResult<PathBuf> {
    let cur = current.to_path_buf();
    let next = ctx.scratch_pdf("opt_strip", i);
    let next_cloned = next.clone();
    let strip = stages.strip_metadata;
    let removeform = stages.remove_form_data;
    tokio::task::spawn_blocking(move || strip_pdf_entries(&cur, &next_cloned, strip, removeform))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })??;
    Ok(next)
}

fn strip_pdf_entries(cur: &Path, out: &Path, strip: bool, removeform: bool) -> AppResult<()> {
    let mut doc =
        crate::services::pdf_guard::load_guarded(cur).map_err(|e| AppError::PdfCorrupted {
            detail: e.to_string(),
        })?;
    if strip {
        doc.trailer.remove(b"Info");
        remove_catalog_entry(&mut doc, b"Metadata");
    }
    if removeform {
        remove_catalog_entry(&mut doc, b"AcroForm");
    }
    doc.compress();
    doc.save(out).map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    Ok(())
}

fn remove_catalog_entry(doc: &mut lopdf::Document, key: &[u8]) {
    if let Ok(catalog_id) = doc.trailer.get(b"Root").and_then(|o| o.as_reference()) {
        if let Some(catalog) = doc.objects.get_mut(&catalog_id) {
            if let Ok(d) = catalog.as_dict_mut() {
                d.remove(key);
            }
        }
    }
}

async fn run_unlock_node(ctx: &NodeCtx<'_>, password: Option<&str>) -> AppResult<Vec<PathBuf>> {
    let mut outs = Vec::new();
    for (i, src) in ctx.inputs.iter().enumerate() {
        let dst = ctx.scratch_pdf("unlock", i);
        ctx.state.qpdf.decrypt(src, &dst, password).await?;
        outs.push(dst);
    }
    Ok(outs)
}

async fn run_convert_node(
    ctx: &NodeCtx<'_>,
    format: &NodeExportFormat,
    out_dir: Option<&str>,
) -> AppResult<Vec<PathBuf>> {
    // Convert produces non-PDF outputs (PNG/JPG/TIFF/TXT/DOCX/...);
    // those don't feed back into a downstream PDF pipeline. We
    // still return them so the caller can collect them in a Save
    // node OR show them in the result list.
    let dir = out_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| ctx.scratch.to_path_buf());
    std::fs::create_dir_all(&dir).ok();
    let mut outs = Vec::new();
    for (idx, src) in ctx.inputs.iter().enumerate() {
        let stem = src
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("out")
            .to_string();
        outs.extend(convert_one(ctx, format, &dir, src, &stem, idx).await?);
    }
    Ok(outs)
}

async fn convert_one(
    ctx: &NodeCtx<'_>,
    format: &NodeExportFormat,
    dir: &Path,
    src: &Path,
    stem: &str,
    idx: usize,
) -> AppResult<Vec<PathBuf>> {
    match format {
        NodeExportFormat::Png | NodeExportFormat::Jpg | NodeExportFormat::Tiff => {
            convert_raster(ctx, format, dir, src, stem, idx).await
        }
        NodeExportFormat::Txt => {
            let out = dir.join(format!("{stem}-{idx}.txt"));
            let text = ctx.state.mupdf.extract_text(src).await?;
            tokio::fs::write(&out, text)
                .await
                .map_err(|e| AppError::IoError {
                    detail: e.to_string(),
                })?;
            Ok(vec![out])
        }
        NodeExportFormat::Html => {
            let out = dir.join(format!("{stem}-{idx}.html"));
            ctx.state
                .mupdf
                .convert_to_format(src, &out, "html", 150, Some(ctx.cancel.clone()))
                .await?;
            Ok(vec![out])
        }
        NodeExportFormat::Docx
        | NodeExportFormat::Odt
        | NodeExportFormat::Rtf
        | NodeExportFormat::Epub => {
            let target = match format {
                NodeExportFormat::Docx => "docx",
                NodeExportFormat::Odt => "odt",
                NodeExportFormat::Rtf => "rtf",
                NodeExportFormat::Epub => "epub",
                _ => unreachable!(),
            };
            let out = ctx
                .state
                .soffice
                .convert(src, dir, target, Some(ctx.cancel.clone()))
                .await?;
            Ok(vec![out])
        }
        NodeExportFormat::Pdfa => convert_pdfa(ctx, dir, src, stem, idx).await,
    }
}

async fn convert_raster(
    ctx: &NodeCtx<'_>,
    format: &NodeExportFormat,
    dir: &Path,
    src: &Path,
    stem: &str,
    idx: usize,
) -> AppResult<Vec<PathBuf>> {
    let (fmt, ext, multi) = match format {
        NodeExportFormat::Png => ("png", "png", false),
        NodeExportFormat::Jpg => ("jpeg", "jpg", false),
        NodeExportFormat::Tiff => ("tiff", "tiff", true),
        _ => unreachable!(),
    };
    let pattern = if multi {
        dir.join(format!("{stem}-{idx}.{ext}"))
    } else {
        dir.join(format!("{stem}-{idx}-%d.{ext}"))
    };
    ctx.state
        .mupdf
        .convert_to_format(src, &pattern, fmt, 150, Some(ctx.cancel.clone()))
        .await?;
    if multi {
        return Ok(vec![pattern]);
    }
    let mut outs = Vec::new();
    for n in 1..=10_000u32 {
        let cand = dir.join(format!("{stem}-{idx}-{n}.{ext}"));
        if !cand.exists() {
            break;
        }
        outs.push(cand);
    }
    Ok(outs)
}

async fn convert_pdfa(
    ctx: &NodeCtx<'_>,
    dir: &Path,
    src: &Path,
    stem: &str,
    idx: usize,
) -> AppResult<Vec<PathBuf>> {
    // Delta E: LO primary, GS fallback.
    let lo_target =
        "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}";
    let lo_attempt = ctx
        .state
        .soffice
        .convert(src, dir, lo_target, Some(ctx.cancel.clone()))
        .await;
    match lo_attempt {
        Ok(out) => Ok(vec![out]),
        Err(_) => {
            let gs_out = dir.join(format!("{stem}-{idx}-pdfa.pdf"));
            ctx.state
                .gs
                .convert_to_pdfa(src, &gs_out, 2, Some(ctx.cancel.clone()))
                .await?;
            Ok(vec![gs_out])
        }
    }
}

async fn run_convert_import_node(
    ctx: &NodeCtx<'_>,
    extra_inputs: &[String],
) -> AppResult<Vec<PathBuf>> {
    // Convert non-PDF inputs to PDFs via LibreOffice. Image-to-PDF
    // for bitmaps would be ideal but the existing pipeline routes
    // both office and image inputs through soffice in
    // commands::convert_import (image_to_pdf is the alternative
    // service); we mirror the simpler soffice path for v1 across
    // both image and office types.
    let mut outs = Vec::new();
    let combined: Vec<PathBuf> = ctx
        .inputs
        .iter()
        .cloned()
        .chain(extra_inputs.iter().map(PathBuf::from))
        .collect();
    for src in combined.iter() {
        let out = ctx
            .state
            .soffice
            .convert(src, ctx.scratch, "pdf", Some(ctx.cancel.clone()))
            .await?;
        outs.push(out);
    }
    Ok(outs)
}

async fn run_merge_node(ctx: &NodeCtx<'_>) -> AppResult<Vec<PathBuf>> {
    if ctx.inputs.is_empty() {
        return Ok(vec![]);
    }
    let dst = ctx.scratch.join(format!("merged_{}.pdf", ctx.node_idx));
    let inputs_owned = ctx.inputs.to_vec();
    let dst_owned = dst.clone();
    run_blocking(move || pdf_editor::merge_pdfs(&inputs_owned, &dst_owned)).await?;
    Ok(vec![dst])
}

async fn run_split_node(ctx: &NodeCtx<'_>, ranges: &[[u32; 2]]) -> AppResult<Vec<PathBuf>> {
    let mut outs = Vec::new();
    for (i, src) in ctx.inputs.iter().enumerate() {
        let dir = ctx.scratch.join(format!("split_{}_{i}", ctx.node_idx));
        std::fs::create_dir_all(&dir).ok();
        let r: Vec<RangeInclusive<u32>> = ranges.iter().map(|[a, b]| *a..=*b).collect();
        let src_owned = src.clone();
        let dir_owned = dir.clone();
        let parts = run_blocking(move || pdf_editor::split_pdf(&src_owned, &r, &dir_owned)).await?;
        outs.extend(parts);
    }
    Ok(outs)
}

/// The Crop node's switches that the pipeline acts on.
struct CropSpec {
    bbox: Option<[f32; 4]>,
    auto_detect: bool,
    apply_to_all_pages: bool,
    page_index: u32,
    auto_threshold: u8,
}

async fn run_crop_node(ctx: &NodeCtx<'_>, spec: CropSpec) -> AppResult<Vec<PathBuf>> {
    let mut outs = Vec::new();
    for (i, src) in ctx.inputs.iter().enumerate() {
        let resolved = resolve_crop_box(ctx, &spec, src).await?;
        let out = ctx.scratch_pdf("crop", i);
        let src_owned = src.clone();
        let out_owned = out.clone();
        let target_all = spec.apply_to_all_pages;
        let page_idx = spec.page_index;
        tokio::task::spawn_blocking(move || {
            write_crop_box(&src_owned, &out_owned, resolved, target_all, page_idx)
        })
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })??;
        outs.push(out);
    }
    Ok(outs)
}

async fn resolve_crop_box(ctx: &NodeCtx<'_>, spec: &CropSpec, src: &Path) -> AppResult<[f32; 4]> {
    use crate::services::crop::auto_detect_bbox_from_image;
    const AUTO_DETECT_DPI: u32 = 100;
    if !spec.auto_detect {
        return spec.bbox.ok_or_else(|| AppError::InvalidArgument {
            detail: "crop node: bbox required when auto_detect = false".into(),
        });
    }
    let auto_threshold = spec.auto_threshold;
    let inner_tmp = tempfile::tempdir().map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    let png = inner_tmp.path().join("p.png");
    ctx.state
        .mupdf
        .render_page_to_png(
            src,
            spec.page_index,
            &png,
            AUTO_DETECT_DPI,
            Some(ctx.cancel.clone()),
        )
        .await?;
    let png_clone = png.clone();
    let detected = tokio::task::spawn_blocking(move || {
        auto_detect_bbox_from_image(&png_clone, AUTO_DETECT_DPI, auto_threshold)
    })
    .await
    .map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?
    .map_err(|e| AppError::Internal {
        detail: format!("{e:#}"),
    })?;
    Ok([detected.0, detected.1, detected.2, detected.3])
}

fn write_crop_box(
    src: &Path,
    out: &Path,
    resolved: [f32; 4],
    target_all: bool,
    page_idx: u32,
) -> AppResult<()> {
    let mut doc =
        crate::services::pdf_guard::load_guarded(src).map_err(|e| AppError::PdfCorrupted {
            detail: e.to_string(),
        })?;
    let pages = doc.get_pages();
    let target_pages: Vec<u32> = if target_all {
        pages.keys().copied().collect()
    } else {
        vec![page_idx + 1]
    };
    for page_num in target_pages {
        if let Some(&page_id) = pages.get(&page_num) {
            set_crop_box(&mut doc, page_id, resolved);
        }
    }
    doc.compress();
    doc.save(out).map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    Ok(())
}

fn set_crop_box(doc: &mut lopdf::Document, page_id: lopdf::ObjectId, resolved: [f32; 4]) {
    if let Some(obj) = doc.objects.get_mut(&page_id) {
        if let Ok(d) = obj.as_dict_mut() {
            let crop_array: Vec<lopdf::Object> = vec![
                lopdf::Object::Real(resolved[0]),
                lopdf::Object::Real(resolved[1]),
                lopdf::Object::Real(resolved[0] + resolved[2]),
                lopdf::Object::Real(resolved[1] + resolved[3]),
            ];
            d.set("CropBox", crop_array);
        }
    }
}

fn ocr_node_options(
    engine: &crate::pipeline::dag::NodeOcrEngine,
    language: &str,
    dpi: u32,
    output: &NodeOcrOutputMode,
    deskew: bool,
    despeckle: bool,
) -> OcrOptions {
    OcrOptions {
        engine: match engine {
            crate::pipeline::dag::NodeOcrEngine::Tesseract => OcrEngine::Tesseract,
            crate::pipeline::dag::NodeOcrEngine::RapidOcr => OcrEngine::RapidOcr,
        },
        language: language.to_string(),
        dpi,
        psm: 3,
        oem: 3,
        output: match output {
            NodeOcrOutputMode::SearchablePdf => OcrOutputMode::SearchablePdf,
            NodeOcrOutputMode::PdfPlusText => OcrOutputMode::PdfPlusText,
            NodeOcrOutputMode::TextOnly => OcrOutputMode::TextOnly,
        },
        deskew,
        despeckle,
        preserve_raster: true,
    }
}

type OcrBackendPair = (Arc<dyn OcrBackend>, Option<Arc<dyn OcrBackend>>);

/// The primary OCR backend for an engine, plus the Tesseract fallback that
/// RapidOCR may retry with.
fn ocr_node_backends(state: &AppState, engine: OcrEngine) -> OcrBackendPair {
    match engine {
        OcrEngine::Tesseract => (state.tesseract.clone(), None),
        OcrEngine::RapidOcr => {
            #[cfg(windows)]
            {
                match state.rapidocr.backend.clone() {
                    Some(rapidocr) => (rapidocr, Some(state.tesseract.clone())),
                    None => (state.tesseract.clone(), None),
                }
            }
            #[cfg(not(windows))]
            {
                (state.tesseract.clone(), None)
            }
        }
    }
}

async fn run_ocr_node(ctx: &NodeCtx<'_>, opts: OcrOptions) -> AppResult<Vec<PathBuf>> {
    let mut outs = Vec::new();
    for (idx, src) in ctx.inputs.iter().enumerate() {
        if ctx.cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        outs.push(ocr_one(ctx, &opts, src, idx).await?);
    }
    Ok(outs)
}

async fn ocr_one(
    ctx: &NodeCtx<'_>,
    opts: &OcrOptions,
    src: &Path,
    idx: usize,
) -> AppResult<PathBuf> {
    // Mirror commands::ocr::ocr_pdf logic via the same service
    // composition. Delegates to commands::ocr::inject_text_layers so
    // the Delta W Type0 CIDFont path is the only OCR layer path.
    use crate::commands::ocr::{inject_word_layers, recognized_pages_to_text};

    let dst = ctx.scratch_pdf("ocr", idx);
    let doc_pages = {
        let doc =
            crate::services::pdf_guard::load_guarded(src).map_err(|e| AppError::Internal {
                detail: format!("load: {e}"),
            })?;
        doc.get_pages().len() as u32
    };
    let (backend, fallback) = ocr_node_backends(ctx.state, opts.engine);
    let pages = recognize_node_pages(ctx, opts, src, doc_pages, backend, fallback).await?;
    if matches!(opts.output, OcrOutputMode::TextOnly) {
        // TextOnly: write a sidecar .txt for the .pdf in scratch
        // and emit the .txt as the "output" of this node.
        let plain = recognized_pages_to_text(&pages);
        let txt = ctx.scratch.join(format!("ocr_{}_{idx}.txt", ctx.node_idx));
        std::fs::write(&txt, plain).map_err(|e| AppError::IoError {
            detail: e.to_string(),
        })?;
        return Ok(txt);
    }
    let pdf_in_b = src.to_path_buf();
    let pdf_out_b = dst.clone();
    let pages_b = pages.clone();
    let opts_b = opts.clone();
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        inject_word_layers(&pdf_in_b, &pdf_out_b, &opts_b, &pages_b)
    })
    .await
    .map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?
    .map_err(|e| AppError::Internal {
        detail: format!("{e:#}"),
    })?;
    Ok(dst)
}

/// Recognizes with the primary backend. A failed RapidOCR run retries once
/// with the fallback; a cancellation never retries.
async fn recognize_node_pages(
    ctx: &NodeCtx<'_>,
    opts: &OcrOptions,
    pdf_in: &Path,
    doc_pages: u32,
    backend: Arc<dyn OcrBackend>,
    fallback: Option<Arc<dyn OcrBackend>>,
) -> AppResult<Vec<RecognizedOcrPage>> {
    let recognize = |backend: Arc<dyn OcrBackend>| {
        recognize_pdf_pages(
            pdf_in,
            doc_pages,
            opts,
            ctx.state.mupdf.clone(),
            backend,
            ctx.state.pool.clone(),
            ctx.cancel.clone(),
        )
    };
    match recognize(backend).await {
        Ok(pages) => Ok(pages),
        Err(AppError::Cancelled) => Err(AppError::Cancelled),
        Err(error) => {
            let Some(fallback) = fallback else {
                return Err(error);
            };
            tracing::warn!(
                target: "ocr",
                "RapidOCR pipeline node failed; retrying with Tesseract: {error}"
            );
            recognize(fallback).await
        }
    }
}

fn run_save_node(ctx: &NodeCtx<'_>, dir: &str, name_template: &str) -> AppResult<Vec<PathBuf>> {
    std::fs::create_dir_all(dir).ok();
    let date = Utc::now().format("%Y-%m-%d").to_string();
    let mut outs = Vec::new();
    for (i, src) in ctx.inputs.iter().enumerate() {
        let dst = PathBuf::from(dir).join(save_file_name(name_template, src, i, &date));
        std::fs::copy(src, &dst).map_err(|e| AppError::IoError {
            detail: e.to_string(),
        })?;
        outs.push(dst);
    }
    Ok(outs)
}

fn save_file_name(name_template: &str, src: &Path, i: usize, date: &str) -> String {
    let tool = "pipeline";
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("out");
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("pdf");
    let mut name = name_template
        .replace("{stem}", stem)
        .replace("{i}", &i.to_string())
        .replace("{date}", date)
        .replace("{tool}", tool);
    if !name.contains('.') {
        name.push('.');
        name.push_str(ext);
    }
    name
}

#[cfg(test)]
mod open_file_tests {
    use super::{resolve_open_file_paths, run_pipeline};
    use crate::app_state::AppState;
    use crate::pipeline::dag::{NodeKind, Pipeline, PipelineNode};
    use crate::util::progress::ProgressReporter;
    use sqlx::sqlite::SqlitePoolOptions;
    use tokio::sync::mpsc;
    use tokio_util::sync::CancellationToken;

    fn open_file_pipeline(paths: Vec<String>) -> Pipeline {
        Pipeline {
            nodes: vec![PipelineNode {
                id: "open".into(),
                kind: NodeKind::OpenFile { paths },
            }],
            edges: Vec::new(),
        }
    }

    fn test_state() -> AppState {
        let pool = SqlitePoolOptions::new()
            .connect_lazy("sqlite::memory:")
            .unwrap();
        AppState::new(pool)
    }

    fn test_reporter() -> ProgressReporter {
        let (tx, _rx) = mpsc::channel(8);
        ProgressReporter::new("open-file-test".into(), tx)
    }

    #[test]
    fn resolves_existing_pdf() {
        let pdf =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/pdfs/sample.pdf");
        let out = resolve_open_file_paths(&[pdf.display().to_string()]).unwrap();
        assert_eq!(out, vec![pdf]);
    }

    #[test]
    fn missing_file_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("missing.pdf");
        let err = resolve_open_file_paths(&[missing.display().to_string()])
            .expect_err("missing file must error");
        assert_eq!(err.key(), "file_not_found");
    }

    #[test]
    fn non_pdf_extension_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let txt = tmp.path().join("a.txt");
        std::fs::File::create(&txt).unwrap();
        let err = resolve_open_file_paths(&[txt.display().to_string()])
            .expect_err("non-pdf extension must error");
        assert_eq!(err.key(), "invalid_argument");
    }

    #[test]
    fn empty_selection_errors() {
        let err = resolve_open_file_paths(&[]).expect_err("empty selection must error");
        assert_eq!(err.key(), "invalid_argument");
    }

    #[tokio::test]
    async fn executor_uses_open_file_node_as_source() {
        let pdf =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/pdfs/sample.pdf");
        let pipeline = open_file_pipeline(vec![pdf.display().to_string()]);

        let out = run_pipeline(
            &test_state(),
            &pipeline,
            &[],
            &test_reporter(),
            CancellationToken::new(),
        )
        .await
        .unwrap();

        assert_eq!(out, vec![pdf]);
    }

    #[tokio::test]
    async fn executor_reports_missing_open_file() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("missing.pdf");
        let pipeline = open_file_pipeline(vec![missing.display().to_string()]);

        let err = run_pipeline(
            &test_state(),
            &pipeline,
            &[],
            &test_reporter(),
            CancellationToken::new(),
        )
        .await
        .expect_err("missing open-file source must fail");

        assert_eq!(err.key(), "file_not_found");
    }
}

// Delta W: page_dimensions + ensure_helv_font now live in commands::ocr.rs
// (inject_text_layers shares them with the pipeline OCR node).
