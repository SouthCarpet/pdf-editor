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
use crate::error::{AppError, AppResult};
use crate::pipeline::dag::{
    NodeExportFormat, NodeKind, NodeOcrOutputMode, Pipeline, PreservationWarning,
};
use crate::pipeline::preservation::Artifact;
use crate::services::ocr_engine::{OcrOptions, OcrOutputMode};
use crate::services::pdf_editor;
use crate::util::progress::ProgressReporter;
use chrono::Utc;
use std::collections::HashMap;
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};
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
    let order = pipeline
        .topo_order()
        .map_err(|e| AppError::Internal { detail: e.to_string() })?;
    let scratch = tempfile::tempdir().map_err(|e| AppError::IoError { detail: e.to_string() })?;
    let mut current_files: Vec<PathBuf> = inputs.to_vec();
    let total = order.len().max(1) as f32;

    reporter.started(Some("pipeline starting".into())).await;

    // Delta Y: log preflight warnings (the run command surfaces them in
    // the report so the frontend can decorate the canvas; we log so the
    // ops logs reflect what the user accepted before running).
    for w in preflight_warnings(pipeline) {
        tracing::warn!(
            from = %w.from,
            to = %w.to,
            artifacts = ?w.artifacts,
            "pipeline preflight: downstream node may strip upstream artifact",
        );
    }

    for (i, node_id) in order.iter().enumerate() {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let node = pipeline
            .nodes
            .iter()
            .find(|n| &n.id == node_id)
            .ok_or_else(|| AppError::Internal {
                detail: format!("node {node_id} disappeared after topo sort"),
            })?;
        let label = format!("node {} of {}: {}", i + 1, order.len(), node_label(&node.kind));
        // Delta Y: trace each node's preservation contract so a post-run
        // investigation can reconstruct what was guaranteed kept vs what
        // was permitted to be stripped on a per-step basis.
        let contract = node.kind.preservation();
        tracing::info!(
            node = %node.id,
            label = %label,
            preserves = ?contract.preserves,
            may_strip = ?contract.may_strip,
            "pipeline node preservation contract",
        );
        reporter.progress(i as f32 / total, Some(label)).await;
        current_files = run_node(state, &node.kind, &current_files, scratch.path(), cancel.clone(), i).await?;
    }
    reporter.progress(1.0, Some("pipeline complete".into())).await;
    // The TempDir is dropped here, but we may have copied into it. The
    // Save node copies to a user-chosen dir; for inter-stage outputs that
    // are NOT followed by a Save, we materialize a stable copy in a
    // sibling final-results dir so the paths returned to the caller survive
    // the TempDir cleanup.
    let final_paths = materialize_final(&scratch, &current_files)?;
    Ok(final_paths)
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
    std::fs::create_dir_all(&dst_dir).map_err(|e| AppError::IoError { detail: e.to_string() })?;
    for src in current {
        if src.starts_with(scratch_root) {
            let name = src
                .file_name()
                .ok_or_else(|| AppError::Internal {
                    detail: format!("missing file name for {}", src.display()),
                })?;
            let dst = dst_dir.join(name);
            std::fs::copy(src, &dst).map_err(|e| AppError::IoError { detail: e.to_string() })?;
            out.push(dst);
        } else {
            out.push(src.clone());
        }
    }
    Ok(out)
}

async fn run_node(
    state: &AppState,
    kind: &NodeKind,
    inputs: &[PathBuf],
    scratch: &Path,
    cancel: CancellationToken,
    node_idx: usize,
) -> AppResult<Vec<PathBuf>> {
    match kind {
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
        } => {
            // Custom quality/dpi are advisory; GhostscriptWrapper::compress
            // doesn't yet take custom knobs (Phase 9 ships preset-only). The
            // pipeline accepts the fields so the UI form survives across the
            // FFI boundary, and a follow-up phase can wire them through.
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let dst = scratch.join(format!("compress_{node_idx}_{i}.pdf"));
                state
                    .gs
                    .compress(src, &dst, (*preset).into(), Some(cancel.clone()))
                    .await?;
                outs.push(dst);
            }
            Ok(outs)
        }
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
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let mut current = src.clone();
                if *flatten_annotations {
                    let next = scratch.join(format!("opt_flatten_{node_idx}_{i}.pdf"));
                    state
                        .qpdf
                        .flatten_annotations(&current, &next, Some(cancel.clone()))
                        .await?;
                    current = next;
                }
                if *subset_fonts {
                    let next = scratch.join(format!("opt_subset_{node_idx}_{i}.pdf"));
                    state
                        .mupdf
                        .clean_subset_fonts(&current, &next, Some(cancel.clone()))
                        .await?;
                    current = next;
                }
                if *object_streams || *remove_unused {
                    let next = scratch.join(format!("opt_os_{node_idx}_{i}.pdf"));
                    state
                        .qpdf
                        .object_streams_generate(&current, &next, Some(cancel.clone()))
                        .await?;
                    current = next;
                }
                if *linearize {
                    let next = scratch.join(format!("opt_lin_{node_idx}_{i}.pdf"));
                    state
                        .qpdf
                        .linearize(&current, &next, Some(cancel.clone()))
                        .await?;
                    current = next;
                }
                if let Some(_lang) = make_searchable_ocr {
                    // Optimize-stage OCR — Phase 13 wired the full OCR
                    // command but Optimize currently elides it (see
                    // commands/optimize.rs). Pipeline follows the same
                    // policy: log + skip. The user can chain a dedicated
                    // OCR node before/after Optimize for the real layer.
                    tracing::warn!(
                        "pipeline optimize: make_searchable_ocr ignored (use an OCR node instead)"
                    );
                }
                if let Some(version) = convert_pdfa {
                    let lo_target = "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}";
                    let lo_attempt = state
                        .soffice
                        .convert(&current, scratch, lo_target, Some(cancel.clone()))
                        .await;
                    current = match lo_attempt {
                        Ok(out) => out,
                        Err(_) => {
                            let gs_out =
                                scratch.join(format!("opt_pdfa_{node_idx}_{i}.pdf"));
                            state
                                .gs
                                .convert_to_pdfa(&current, &gs_out, *version, Some(cancel.clone()))
                                .await?;
                            gs_out
                        }
                    };
                }
                if *strip_metadata || *remove_form_data {
                    let cur = current.clone();
                    let next = scratch.join(format!("opt_strip_{node_idx}_{i}.pdf"));
                    let next_cloned = next.clone();
                    let strip = *strip_metadata;
                    let removeform = *remove_form_data;
                    tokio::task::spawn_blocking(move || -> AppResult<()> {
                        let mut doc = lopdf::Document::load(&cur)
                            .map_err(|e| AppError::PdfCorrupted { detail: e.to_string() })?;
                        if strip {
                            doc.trailer.remove(b"Info");
                            if let Ok(catalog_id) =
                                doc.trailer.get(b"Root").and_then(|o| o.as_reference())
                            {
                                if let Some(catalog) = doc.objects.get_mut(&catalog_id) {
                                    if let Ok(d) = catalog.as_dict_mut() {
                                        d.remove(b"Metadata");
                                    }
                                }
                            }
                        }
                        if removeform {
                            if let Ok(catalog_id) =
                                doc.trailer.get(b"Root").and_then(|o| o.as_reference())
                            {
                                if let Some(catalog) = doc.objects.get_mut(&catalog_id) {
                                    if let Ok(d) = catalog.as_dict_mut() {
                                        d.remove(b"AcroForm");
                                    }
                                }
                            }
                        }
                        doc.compress();
                        doc.save(&next_cloned)
                            .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                        Ok(())
                    })
                    .await
                    .map_err(|e| AppError::Internal { detail: e.to_string() })??;
                    current = next;
                }
                outs.push(current);
            }
            Ok(outs)
        }
        NodeKind::Unlock { password } => {
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let dst = scratch.join(format!("unlock_{node_idx}_{i}.pdf"));
                state.qpdf.decrypt(src, &dst, password.as_deref()).await?;
                outs.push(dst);
            }
            Ok(outs)
        }
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
        } => {
            // Convert produces non-PDF outputs (PNG/JPG/TIFF/TXT/DOCX/...);
            // those don't feed back into a downstream PDF pipeline. We
            // still return them so the caller can collect them in a Save
            // node OR show them in the result list.
            let dir = out_dir
                .as_ref()
                .map(PathBuf::from)
                .unwrap_or_else(|| scratch.to_path_buf());
            std::fs::create_dir_all(&dir).ok();
            let mut outs = Vec::new();
            for (idx, src) in inputs.iter().enumerate() {
                let stem = src
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("out")
                    .to_string();
                match format {
                    NodeExportFormat::Png | NodeExportFormat::Jpg | NodeExportFormat::Tiff => {
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
                        state
                            .mupdf
                            .convert_to_format(src, &pattern, fmt, 150, Some(cancel.clone()))
                            .await?;
                        if multi {
                            outs.push(pattern);
                        } else {
                            for n in 1..=10_000u32 {
                                let cand = dir.join(format!("{stem}-{idx}-{n}.{ext}"));
                                if cand.exists() {
                                    outs.push(cand);
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                    NodeExportFormat::Txt => {
                        let out = dir.join(format!("{stem}-{idx}.txt"));
                        let text = state.mupdf.extract_text(src).await?;
                        tokio::fs::write(&out, text)
                            .await
                            .map_err(|e| AppError::IoError { detail: e.to_string() })?;
                        outs.push(out);
                    }
                    NodeExportFormat::Html => {
                        let out = dir.join(format!("{stem}-{idx}.html"));
                        state
                            .mupdf
                            .convert_to_format(src, &out, "html", 150, Some(cancel.clone()))
                            .await?;
                        outs.push(out);
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
                        let out = state
                            .soffice
                            .convert(src, &dir, target, Some(cancel.clone()))
                            .await?;
                        outs.push(out);
                    }
                    NodeExportFormat::Pdfa => {
                        // Delta E: LO primary, GS fallback.
                        let lo_target =
                            "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}";
                        let lo_attempt = state
                            .soffice
                            .convert(src, &dir, lo_target, Some(cancel.clone()))
                            .await;
                        match lo_attempt {
                            Ok(out) => outs.push(out),
                            Err(_) => {
                                let gs_out =
                                    dir.join(format!("{stem}-{idx}-pdfa.pdf"));
                                state
                                    .gs
                                    .convert_to_pdfa(src, &gs_out, 2, Some(cancel.clone()))
                                    .await?;
                                outs.push(gs_out);
                            }
                        }
                    }
                }
            }
            Ok(outs)
        }
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
        } => {
            // Convert non-PDF inputs to PDFs via LibreOffice. Image-to-PDF
            // for bitmaps would be ideal but the existing pipeline routes
            // both office and image inputs through soffice in
            // commands::convert_import (image_to_pdf is the alternative
            // service); we mirror the simpler soffice path for v1 across
            // both image and office types.
            let mut outs = Vec::new();
            let combined: Vec<PathBuf> = inputs
                .iter()
                .cloned()
                .chain(extra_inputs.iter().map(PathBuf::from))
                .collect();
            for src in combined.iter() {
                let out = state
                    .soffice
                    .convert(src, scratch, "pdf", Some(cancel.clone()))
                    .await?;
                outs.push(out);
            }
            Ok(outs)
        }
        NodeKind::Merge {} => {
            if inputs.is_empty() {
                return Ok(vec![]);
            }
            let dst = scratch.join(format!("merged_{node_idx}.pdf"));
            let inputs_owned = inputs.to_vec();
            let dst_owned = dst.clone();
            tokio::task::spawn_blocking(move || pdf_editor::merge_pdfs(&inputs_owned, &dst_owned))
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })?
                .map_err(|e| AppError::Internal { detail: e.to_string() })?;
            Ok(vec![dst])
        }
        NodeKind::Split { ranges } => {
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let dir = scratch.join(format!("split_{node_idx}_{i}"));
                std::fs::create_dir_all(&dir).ok();
                let r: Vec<RangeInclusive<u32>> =
                    ranges.iter().map(|[a, b]| *a..=*b).collect();
                let src_owned = src.clone();
                let dir_owned = dir.clone();
                let parts = tokio::task::spawn_blocking(move || {
                    pdf_editor::split_pdf(&src_owned, &r, &dir_owned)
                })
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })?
                .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                outs.extend(parts);
            }
            Ok(outs)
        }
        NodeKind::Extract { pages } => {
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let out = scratch.join(format!("extract_{node_idx}_{i}.pdf"));
                let src_owned = src.clone();
                let out_owned = out.clone();
                let p = pages.clone();
                tokio::task::spawn_blocking(move || {
                    pdf_editor::extract_pages(&src_owned, &p, &out_owned)
                })
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })?
                .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                outs.push(out);
            }
            Ok(outs)
        }
        NodeKind::OrganizeRotate { rotations } => {
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let out = scratch.join(format!("rotate_{node_idx}_{i}.pdf"));
                let src_owned = src.clone();
                let out_owned = out.clone();
                let pairs: Vec<(u32, i64)> =
                    rotations.iter().map(|[p, d]| (*p as u32, *d)).collect();
                tokio::task::spawn_blocking(move || {
                    pdf_editor::rotate_pages(&src_owned, &pairs, &out_owned)
                })
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })?
                .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                outs.push(out);
            }
            Ok(outs)
        }
        NodeKind::OrganizeDelete { pages } => {
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let out = scratch.join(format!("delete_{node_idx}_{i}.pdf"));
                let src_owned = src.clone();
                let out_owned = out.clone();
                let pgs = pages.clone();
                tokio::task::spawn_blocking(move || {
                    pdf_editor::delete_pages(&src_owned, &pgs, &out_owned)
                })
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })?
                .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                outs.push(out);
            }
            Ok(outs)
        }
        NodeKind::OrganizeReorder { new_order } => {
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let out = scratch.join(format!("reorder_{node_idx}_{i}.pdf"));
                let src_owned = src.clone();
                let out_owned = out.clone();
                let order = new_order.clone();
                tokio::task::spawn_blocking(move || {
                    pdf_editor::reorder_pages(&src_owned, &order, &out_owned)
                })
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })?
                .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                outs.push(out);
            }
            Ok(outs)
        }
        NodeKind::OrganizeInsertBlank {
            after_page_index,
            width,
            height,
        } => {
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let out = scratch.join(format!("insertblank_{node_idx}_{i}.pdf"));
                let src_owned = src.clone();
                let out_owned = out.clone();
                let after = *after_page_index;
                let w = *width;
                let h = *height;
                tokio::task::spawn_blocking(move || {
                    pdf_editor::insert_blank_page(&src_owned, after, &out_owned, w, h)
                })
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })?
                .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                outs.push(out);
            }
            Ok(outs)
        }
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
            use crate::services::crop::auto_detect_bbox_from_image;
            const AUTO_DETECT_DPI: u32 = 100;
            let auto_threshold: u8 = *auto_detect_threshold;
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let resolved: [f32; 4] = if *auto_detect {
                    let inner_tmp = tempfile::tempdir()
                        .map_err(|e| AppError::IoError { detail: e.to_string() })?;
                    let png = inner_tmp.path().join("p.png");
                    state
                        .mupdf
                        .render_page_to_png(src, *page_index, &png, AUTO_DETECT_DPI, Some(cancel.clone()))
                        .await?;
                    let png_clone = png.clone();
                    let detected = tokio::task::spawn_blocking(move || {
                        auto_detect_bbox_from_image(
                            &png_clone,
                            AUTO_DETECT_DPI,
                            auto_threshold,
                        )
                    })
                    .await
                    .map_err(|e| AppError::Internal { detail: e.to_string() })?
                    .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
                    [detected.0, detected.1, detected.2, detected.3]
                } else {
                    bbox.ok_or_else(|| AppError::InvalidArgument {
                        detail: "crop node: bbox required when auto_detect = false".into(),
                    })?
                };
                let out = scratch.join(format!("crop_{node_idx}_{i}.pdf"));
                let src_owned = src.clone();
                let out_owned = out.clone();
                let target_all = *apply_to_all_pages;
                let page_idx = *page_index;
                tokio::task::spawn_blocking(move || -> AppResult<()> {
                    let mut doc = lopdf::Document::load(&src_owned)
                        .map_err(|e| AppError::PdfCorrupted { detail: e.to_string() })?;
                    let pages = doc.get_pages();
                    let target_pages: Vec<u32> = if target_all {
                        pages.keys().copied().collect()
                    } else {
                        vec![page_idx + 1]
                    };
                    for page_num in target_pages {
                        if let Some(&page_id) = pages.get(&page_num) {
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
                    }
                    doc.compress();
                    doc.save(&out_owned)
                        .map_err(|e| AppError::Internal { detail: e.to_string() })?;
                    Ok(())
                })
                .await
                .map_err(|e| AppError::Internal { detail: e.to_string() })??;
                outs.push(out);
            }
            Ok(outs)
        }
        NodeKind::Ocr {
            language,
            dpi,
            output,
            deskew,
            despeckle,
        } => {
            // Mirror commands::ocr::ocr_pdf logic via the same service
            // composition. Delegates to commands::ocr::inject_text_layers so
            // the Delta W Type0 CIDFont path is the only OCR layer path.
            use crate::commands::ocr::inject_text_layers;
            use lopdf::Document;

            let opts = OcrOptions {
                language: language.clone(),
                dpi: *dpi,
                psm: 3,
                oem: 3,
                output: match output {
                    NodeOcrOutputMode::SearchablePdf => OcrOutputMode::SearchablePdf,
                    NodeOcrOutputMode::PdfPlusText => OcrOutputMode::PdfPlusText,
                    NodeOcrOutputMode::TextOnly => OcrOutputMode::TextOnly,
                },
                deskew: *deskew,
                despeckle: *despeckle,
                preserve_raster: true,
            };

            let mut outs = Vec::new();
            for (idx, src) in inputs.iter().enumerate() {
                if cancel.is_cancelled() {
                    return Err(AppError::Cancelled);
                }
                let dst = scratch.join(format!("ocr_{node_idx}_{idx}.pdf"));
                let pdf_in = src.clone();
                let pdf_out = dst.clone();
                let local_tmp = tempfile::tempdir()
                    .map_err(|e| AppError::IoError { detail: e.to_string() })?;
                let doc_pages = {
                    let doc = Document::load(&pdf_in)
                        .map_err(|e| AppError::Internal { detail: format!("load: {e}") })?;
                    doc.get_pages().len() as u32
                };
                let mut hocr_per_page: Vec<(u32, String, u32, u32)> = Vec::new();
                for page_index in 0..doc_pages {
                    if cancel.is_cancelled() {
                        return Err(AppError::Cancelled);
                    }
                    let raster = local_tmp.path().join(format!("page-{page_index}.png"));
                    state
                        .mupdf
                        .render_page_to_png(&pdf_in, page_index, &raster, opts.dpi, Some(cancel.clone()))
                        .await?;
                    let (px_w, px_h) = read_png_dimensions(&raster).unwrap_or((1, 1));
                    let hocr = state
                        .tesseract
                        .ocr_image_with_hocr(&raster, &opts.language, Some(cancel.clone()))
                        .await?;
                    hocr_per_page.push((page_index, hocr, px_w, px_h));
                }
                if !matches!(opts.output, OcrOutputMode::TextOnly) {
                    let pdf_in_b = pdf_in.clone();
                    let pdf_out_b = pdf_out.clone();
                    let hocr_b = hocr_per_page.clone();
                    let opts_b = opts.clone();
                    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
                        inject_text_layers(&pdf_in_b, &pdf_out_b, &opts_b, &hocr_b)
                    })
                    .await
                    .map_err(|e| AppError::Internal { detail: e.to_string() })?
                    .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
                    outs.push(dst);
                } else {
                    // TextOnly: write a sidecar .txt for the .pdf in scratch
                    // and emit the .txt as the "output" of this node.
                    let plain = hocrs_to_text(&hocr_per_page);
                    let txt = scratch.join(format!("ocr_{node_idx}_{idx}.txt"));
                    std::fs::write(&txt, plain)
                        .map_err(|e| AppError::IoError { detail: e.to_string() })?;
                    outs.push(txt);
                }
            }
            Ok(outs)
        }
        NodeKind::Watermark { text, opacity } => {
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
        NodeKind::Save { dir, name_template } => {
            std::fs::create_dir_all(dir).ok();
            let date = Utc::now().format("%Y-%m-%d").to_string();
            let tool = "pipeline";
            let mut outs = Vec::new();
            for (i, src) in inputs.iter().enumerate() {
                let stem = src
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("out");
                let ext = src
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("pdf");
                let mut name = name_template
                    .replace("{stem}", stem)
                    .replace("{i}", &i.to_string())
                    .replace("{date}", &date)
                    .replace("{tool}", tool);
                if !name.contains('.') {
                    name.push('.');
                    name.push_str(ext);
                }
                let dst = PathBuf::from(dir).join(name);
                std::fs::copy(src, &dst)
                    .map_err(|e| AppError::IoError { detail: e.to_string() })?;
                outs.push(dst);
            }
            Ok(outs)
        }
    }
}

fn hocrs_to_text(entries: &[(u32, String, u32, u32)]) -> String {
    use crate::services::ocr_engine::parse_hocr_word;
    let mut out = String::new();
    for (_, h, _, _) in entries {
        let words = parse_hocr_word(h);
        let joined: Vec<String> = words.into_iter().map(|w| w.text).collect();
        out.push_str(&joined.join(" "));
        out.push('\n');
    }
    out
}

fn read_png_dimensions(path: &Path) -> Option<(u32, u32)> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = [0u8; 24];
    f.read_exact(&mut buf).ok()?;
    let w = u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]);
    let h = u32::from_be_bytes([buf[20], buf[21], buf[22], buf[23]]);
    Some((w, h))
}

// Delta W: page_dimensions + ensure_helv_font now live in commands::ocr.rs
// (inject_text_layers shares them with the pipeline OCR node).
