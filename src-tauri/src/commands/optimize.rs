// Phase 9 Task 53 — Optimize tool (modular pipeline).
//
// Each enabled checkbox/option becomes a stage in a chain of intermediate
// PDFs in a tempdir, with `current` tracking the "latest" file. Steps:
//
//   1. flatten_annotations (qpdf --flatten-annotations=all)
//   2. subset_fonts (mutool clean -gggg -S)
//   3. object_streams + remove_unused (qpdf --object-streams=generate
//      --remove-unreferenced-resources=yes)
//   4. linearize (qpdf --linearize)
//   5. make_searchable_ocr — Phase 13 territory; stubbed here behind a
//      tracing warning so Optimize stays usable. (Wiring TesseractWrapper +
//      MupdfWrapper to assemble a searchable PDF requires the hOCR-text-
//      layer routine that lives in Phase 13's ocr_pdf_cmd.)
//   6. convert_pdfa — Delta E routing: LibreOffice first, Ghostscript
//      fallback. The LO `pdf:writer_pdf_Export:'{...}'` filter is the
//      primary path; if LO exits non-zero we retry with GS's `-dPDFA=2`
//      pipeline. Both failures combine into a single SidecarFailed.
//   7. strip_metadata / remove_form_data — pure-Rust lopdf trailer +
//      catalog edits in `spawn_blocking`.
//
// before_bytes/after_bytes let the React layer render "Saved X%".
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use lopdf::{Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::State;
use tracing::warn;

pub const MAX_OPTIMIZE_DRY_RUN_BYTES: u64 = 25 * 1_000_000;
pub const OPTIMIZE_DRY_RUN_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct OptimizeArgs {
    pub input: String,
    pub output: String,
    pub linearize: bool,
    pub remove_unused: bool,
    pub subset_fonts: bool,
    pub object_streams: bool,
    pub strip_metadata: bool,
    pub flatten_annotations: bool,
    pub remove_form_data: bool,
    /// Language code (e.g. "eng+slk") when OCR layer should be added; None to skip.
    pub make_searchable_ocr: Option<String>,
    /// PDF/A version (e.g. 2) when conversion should run; None to skip.
    pub convert_pdfa: Option<u8>,
    pub job_id: String,
    // Delta U Phase 17 Task 86a — sub-option fields. All optional; the
    // service currently dispatches on the simple booleans above. The
    // detail knobs survive over FFI so a follow-up can wire them.
    #[serde(default)]
    pub subset_min_percent: Option<u8>,
    #[serde(default)]
    pub object_streams_level: Option<u8>,
    #[serde(default)]
    pub strip_metadata_fields: Option<crate::pipeline::dag::StripMetadataFieldsDto>,
    #[serde(default)]
    pub flatten_include_forms: Option<bool>,
    #[serde(default)]
    pub ocr_dpi: Option<u32>,
    #[serde(default)]
    pub pdfa_engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OptimizeResult {
    pub output_paths: Vec<String>,
    pub before_bytes: u64,
    pub after_bytes: u64,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct EstimateArgs {
    pub input: String,
    pub options: EstimateOptions,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct EstimateOptions {
    pub linearize: bool,
    pub remove_unused: bool,
    pub subset_fonts: bool,
    pub object_streams: bool,
    pub strip_metadata: bool,
    pub flatten_annotations: bool,
    pub remove_form_data: bool,
    pub make_searchable_ocr: Option<String>,
    pub convert_pdfa: Option<u8>,
    pub ocr_dpi: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum EstimateMethod {
    DryRun,
    Heuristic,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct EstimateResult {
    pub current_bytes: u64,
    pub estimated_bytes: u64,
    pub method: EstimateMethod,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct PdfInventory {
    pub total_bytes: u64,
    pub image_streams: Vec<ImageInventory>,
    pub has_object_streams: bool,
    pub unreferenced_objects: usize,
    pub object_count: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImageInventory {
    pub stream_bytes: u64,
    pub dpi: Option<f64>,
}

/// Conservative fallback used when a real dry run is too expensive or fails.
/// New object streams save 10% of non-image bytes (2% if already present),
/// removal saves the reachable-object ratio capped at 15%, font subsetting 3%,
/// metadata 1%, and form data 0.5%. Combined structural savings are capped at
/// 25% so independent signals cannot over-promise.
pub fn estimate_from_inventory(
    inventory: &PdfInventory,
    options: &EstimateOptions,
) -> EstimateResult {
    let image_bytes = inventory
        .image_streams
        .iter()
        .map(|image| image.stream_bytes)
        .sum::<u64>()
        .min(inventory.total_bytes);
    let structural_bytes = inventory.total_bytes.saturating_sub(image_bytes);
    let mut structural_rate = 0.0_f64;
    let mut details = Vec::new();

    if options.object_streams {
        let rate = if inventory.has_object_streams {
            0.02
        } else {
            0.10
        };
        structural_rate += rate;
        details.push(format!(
            "object streams: {:.0}% of non-image bytes",
            rate * 100.0
        ));
    }
    if options.remove_unused && inventory.object_count > 0 {
        let rate =
            (inventory.unreferenced_objects as f64 / inventory.object_count as f64).min(0.15);
        structural_rate += rate;
        details.push(format!(
            "unreferenced objects: {:.1}% of non-image bytes",
            rate * 100.0
        ));
    }
    if options.subset_fonts {
        structural_rate += 0.03;
        details.push("font subsetting: 3% of non-image bytes".into());
    }
    if options.strip_metadata {
        structural_rate += 0.01;
        details.push("metadata: 1% of non-image bytes".into());
    }
    if options.remove_form_data {
        structural_rate += 0.005;
        details.push("form data: 0.5% of non-image bytes".into());
    }

    let saved = (structural_bytes as f64 * structural_rate.min(0.25)).round() as u64;
    EstimateResult {
        current_bytes: inventory.total_bytes,
        estimated_bytes: inventory.total_bytes.saturating_sub(saved),
        method: EstimateMethod::Heuristic,
        details,
    }
}

fn dry_run_result(current_bytes: u64, estimated_bytes: u64) -> EstimateResult {
    EstimateResult {
        current_bytes,
        estimated_bytes,
        method: EstimateMethod::DryRun,
        details: vec![format!(
            "temporary output measured: {estimated_bytes} bytes"
        )],
    }
}

#[tauri::command]
#[specta::specta]
pub async fn optimize_pdf_cmd(
    state: State<'_, AppState>,
    args: OptimizeArgs,
) -> AppResult<OptimizeResult> {
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let before_bytes = file_len(&input)?;
    let token = state.cancellation.register(&args.job_id);

    let tmp_dir = tempfile::tempdir().map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    let mut current = prepare_optimized_pdf(&state, &args, &input, tmp_dir.path(), &token).await?;

    if args.make_searchable_ocr.is_some() {
        warn_ocr_gated();
    }

    if let Some(version) = args.convert_pdfa {
        let pdfa_path = optimize_pdfa(&state, &current, tmp_dir.path(), version, &token).await?;
        current = pdfa_path;
    }

    current = cleanup_optimized_pdf(&args, &current, tmp_dir.path()).await?;

    std::fs::copy(&current, &output).map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    state.cancellation.forget(&args.job_id);

    let after_bytes = file_len(&output)?;
    Ok(OptimizeResult {
        output_paths: vec![args.output],
        before_bytes,
        after_bytes,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn estimate_optimize_cmd(
    state: State<'_, AppState>,
    args: EstimateArgs,
) -> AppResult<EstimateResult> {
    let input = PathBuf::from(&args.input);
    let current_bytes = std::fs::metadata(&input)
        .map_err(|e| AppError::IoError {
            detail: e.to_string(),
        })?
        .len();
    let inventory_input = input.clone();
    let inventory =
        tokio::task::spawn_blocking(move || inventory_from_pdf(&inventory_input, current_bytes))
            .await
            .map_err(|e| AppError::Internal {
                detail: e.to_string(),
            })??;

    if current_bytes <= MAX_OPTIMIZE_DRY_RUN_BYTES {
        let dry_run = tokio::time::timeout(
            OPTIMIZE_DRY_RUN_TIMEOUT,
            run_optimize_dry_run(&state, &input, &args.options),
        )
        .await;
        if let Ok(Ok(estimated_bytes)) = dry_run {
            return Ok(dry_run_result(current_bytes, estimated_bytes));
        }
    }

    let mut result = estimate_from_inventory(&inventory, &args.options);
    result
        .details
        .push(if current_bytes > MAX_OPTIMIZE_DRY_RUN_BYTES {
            "dry run skipped: input exceeds 25 MB".into()
        } else {
            "dry run failed or exceeded 20 seconds".into()
        });
    Ok(result)
}

async fn run_optimize_dry_run(
    state: &AppState,
    input: &Path,
    options: &EstimateOptions,
) -> AppResult<u64> {
    let tmp_dir = tempfile::tempdir().map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    let mut current = input.to_path_buf();

    if options.flatten_annotations {
        let next = tmp_dir.path().join("flat.pdf");
        state
            .qpdf
            .flatten_annotations(&current, &next, None)
            .await?;
        current = next;
    }
    if options.subset_fonts {
        let next = tmp_dir.path().join("subset.pdf");
        state
            .mupdf
            .clean_subset_fonts(&current, &next, None)
            .await?;
        current = next;
    }
    if options.object_streams || options.remove_unused {
        let next = tmp_dir.path().join("objects.pdf");
        state
            .qpdf
            .object_streams_generate(&current, &next, None)
            .await?;
        current = next;
    }
    if options.linearize {
        let next = tmp_dir.path().join("linearized.pdf");
        state.qpdf.linearize(&current, &next, None).await?;
        current = next;
    }
    if let Some(version) = options.convert_pdfa {
        let next = tmp_dir.path().join("pdfa.pdf");
        state
            .gs
            .convert_to_pdfa(&current, &next, version, None)
            .await?;
        current = next;
    }
    current = cleanup_optimize_dry_run(&current, tmp_dir.path(), options).await?;

    file_len(&current)
}

fn file_len(path: &Path) -> AppResult<u64> {
    std::fs::metadata(path)
        .map(|metadata| metadata.len())
        .map_err(|e| AppError::IoError {
            detail: e.to_string(),
        })
}

fn apply_lopdf_cleanup(
    input: &Path,
    output: &Path,
    strip: bool,
    remove_form: bool,
) -> AppResult<()> {
    let mut doc =
        crate::services::pdf_guard::load_guarded(input).map_err(|e| AppError::PdfCorrupted {
            detail: e.to_string(),
        })?;
    if strip {
        doc.trailer.remove(b"Info");
        if let Ok(catalog_id) = doc.trailer.get(b"Root").and_then(Object::as_reference) {
            if let Some(Ok(catalog)) = doc.objects.get_mut(&catalog_id).map(Object::as_dict_mut) {
                catalog.remove(b"Metadata");
            }
        }
    }
    if remove_form {
        if let Ok(catalog_id) = doc.trailer.get(b"Root").and_then(Object::as_reference) {
            if let Some(Ok(catalog)) = doc.objects.get_mut(&catalog_id).map(Object::as_dict_mut) {
                catalog.remove(b"AcroForm");
            }
        }
    }
    doc.compress();
    doc.save(output)
        .map(|_| ())
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })
}

fn inventory_from_pdf(path: &Path, total_bytes: u64) -> AppResult<PdfInventory> {
    let doc =
        crate::services::pdf_guard::load_guarded(path).map_err(|e| AppError::PdfCorrupted {
            detail: e.to_string(),
        })?;
    Ok(inventory_from_document(&doc, total_bytes))
}

fn inventory_from_document(doc: &Document, total_bytes: u64) -> PdfInventory {
    let image_streams = doc
        .objects
        .values()
        .filter_map(|object| match object {
            Object::Stream(stream)
                if stream.dict.has_type(b"XObject")
                    && stream.dict.get(b"Subtype").and_then(Object::as_name).ok()
                        == Some(b"Image") =>
            {
                let dpi = stream
                    .dict
                    .get(b"DPI")
                    .or_else(|_| stream.dict.get(b"XResolution"))
                    .ok()
                    .and_then(|value| value.as_float().ok())
                    .map(f64::from);
                Some(ImageInventory {
                    stream_bytes: stream.content.len() as u64,
                    dpi,
                })
            }
            _ => None,
        })
        .collect();
    let has_object_streams = doc
        .objects
        .values()
        .any(|object| matches!(object, Object::Stream(stream) if stream.dict.has_type(b"ObjStm")));
    let mut reachable = HashSet::new();
    collect_references(
        &Object::Dictionary(doc.trailer.clone()),
        doc,
        &mut reachable,
    );

    PdfInventory {
        total_bytes,
        image_streams,
        has_object_streams,
        unreferenced_objects: doc.objects.len().saturating_sub(reachable.len()),
        object_count: doc.objects.len(),
    }
}

fn collect_references(object: &Object, doc: &Document, reachable: &mut HashSet<ObjectId>) {
    match object {
        Object::Reference(id) => {
            if !reachable.insert(*id) {
                return;
            }
            if let Some(referenced) = doc.objects.get(id) {
                collect_references(referenced, doc, reachable);
            }
        }
        Object::Array(items) => {
            for item in items {
                collect_references(item, doc, reachable);
            }
        }
        Object::Dictionary(dict) => {
            for (_, value) in dict.iter() {
                collect_references(value, doc, reachable);
            }
        }
        Object::Stream(stream) => {
            for (_, value) in stream.dict.iter() {
                collect_references(value, doc, reachable);
            }
        }
        _ => {}
    }
}

fn warn_ocr_gated() {
    // Phase 13 wires the real hOCR-pdf assembly via TesseractWrapper +
    // MupdfWrapper. For now, log and skip the step so the rest of the
    // pipeline still completes; the user can run OCR via the dedicated
    // OCR tool once Phase 13 lands.
    warn!(
        "optimize: make_searchable_ocr requested but OCR pipeline is gated to Phase 13; skipping"
    );
}

async fn prepare_optimized_pdf(
    state: &AppState,
    args: &OptimizeArgs,
    input: &Path,
    scratch: &Path,
    token: &tokio_util::sync::CancellationToken,
) -> AppResult<PathBuf> {
    let mut current = input.to_path_buf();

    if args.flatten_annotations {
        let next = scratch.join("flat.pdf");
        state
            .qpdf
            .flatten_annotations(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    if args.subset_fonts {
        let next = scratch.join("subset.pdf");
        state
            .mupdf
            .clean_subset_fonts(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    if args.object_streams || args.remove_unused {
        let next = scratch.join("os.pdf");
        state
            .qpdf
            .object_streams_generate(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    if args.linearize {
        let next = scratch.join("lin.pdf");
        state
            .qpdf
            .linearize(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    Ok(current)
}

async fn optimize_pdfa(
    state: &AppState,
    input: &Path,
    scratch: &Path,
    version: u8,
    token: &tokio_util::sync::CancellationToken,
) -> AppResult<PathBuf> {
    // Delta E: LibreOffice primary, Ghostscript fallback.
    let lo_target =
        "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}";
    let lo_attempt = state
        .soffice
        .convert(input, scratch, lo_target, Some(token.clone()))
        .await;
    let output = match lo_attempt {
        Ok(out) => out,
        Err(lo_err) => {
            warn!(error = ?lo_err, "LibreOffice PDF/A export failed; falling back to Ghostscript");
            let gs_out = scratch.join("pdfa.pdf");
            state
                .gs
                .convert_to_pdfa(input, &gs_out, version, Some(token.clone()))
                .await?;
            gs_out
        }
    };
    Ok(output)
}

async fn cleanup_optimized_pdf(
    args: &OptimizeArgs,
    current: &Path,
    scratch: &Path,
) -> AppResult<PathBuf> {
    if args.strip_metadata || args.remove_form_data {
        let cur = current.to_path_buf();
        let next = scratch.join("strip.pdf");
        let next_cloned = next.clone();
        let strip = args.strip_metadata;
        let removeform = args.remove_form_data;
        tokio::task::spawn_blocking(move || {
            apply_lopdf_cleanup(&cur, &next_cloned, strip, removeform)
        })
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })??;
        return Ok(next);
    }
    Ok(current.to_path_buf())
}

async fn cleanup_optimize_dry_run(
    current: &Path,
    scratch: &Path,
    options: &EstimateOptions,
) -> AppResult<PathBuf> {
    if !(options.strip_metadata || options.remove_form_data) {
        return Ok(current.to_path_buf());
    }
    let source = current.to_path_buf();
    let next = scratch.join("clean.pdf");
    let output = next.clone();
    let strip_metadata = options.strip_metadata;
    let remove_form_data = options.remove_form_data;
    tokio::task::spawn_blocking(move || {
        apply_lopdf_cleanup(&source, &output, strip_metadata, remove_form_data)
    })
    .await
    .map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })??;
    Ok(next)
}

#[cfg(test)]
mod estimate_tests {
    use super::*;

    fn options() -> EstimateOptions {
        EstimateOptions {
            linearize: false,
            remove_unused: false,
            subset_fonts: false,
            object_streams: false,
            strip_metadata: false,
            flatten_annotations: false,
            remove_form_data: false,
            make_searchable_ocr: None,
            convert_pdfa: None,
            ocr_dpi: None,
        }
    }

    // Contract (brief 119-CC1): metadata-only and forms-only cleanup use
    // clean.pdf; with neither option, keep the input and create no output.
    fn cleanup_input(scratch: &Path) -> PathBuf {
        use lopdf::dictionary;
        let mut doc = Document::with_version("1.7");
        let root = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "AcroForm" => dictionary! { "Fields" => Vec::<Object>::new() },
        });
        let info = doc.add_object(dictionary! { "Title" => Object::string_literal("Keep source") });
        doc.trailer.set("Root", root);
        doc.trailer.set("Info", info);
        let input = scratch.join("input.pdf");
        doc.save(&input).unwrap();
        input
    }

    #[tokio::test]
    async fn cleanup_dry_run_metadata_only_uses_clean_pdf_without_info() {
        let scratch = tempfile::tempdir().unwrap();
        let input = cleanup_input(scratch.path());
        let source = std::fs::read(&input).unwrap();
        let mut selected = options();
        selected.strip_metadata = true;

        let result = cleanup_optimize_dry_run(&input, scratch.path(), &selected)
            .await
            .unwrap();

        assert_eq!(result, scratch.path().join("clean.pdf"));
        let cleaned = crate::services::pdf_guard::load_guarded(&result).unwrap();
        assert!(!cleaned.trailer.has(b"Info"));
        assert!(cleaned.catalog().unwrap().has(b"AcroForm"));
        assert_eq!(std::fs::read(&input).unwrap(), source);
    }

    #[tokio::test]
    async fn cleanup_dry_run_forms_only_uses_clean_pdf_without_form_data() {
        let scratch = tempfile::tempdir().unwrap();
        let input = cleanup_input(scratch.path());
        let source = std::fs::read(&input).unwrap();
        let mut selected = options();
        selected.remove_form_data = true;

        let result = cleanup_optimize_dry_run(&input, scratch.path(), &selected)
            .await
            .unwrap();

        assert_eq!(result, scratch.path().join("clean.pdf"));
        let cleaned = crate::services::pdf_guard::load_guarded(&result).unwrap();
        assert!(!cleaned.catalog().unwrap().has(b"AcroForm"));
        assert!(cleaned.trailer.has(b"Info"));
        assert_eq!(std::fs::read(&input).unwrap(), source);
    }

    #[tokio::test]
    async fn cleanup_dry_run_without_cleanup_options_keeps_input_and_skips_clean_pdf() {
        let scratch = tempfile::tempdir().unwrap();
        let input = cleanup_input(scratch.path());
        let source = std::fs::read(&input).unwrap();

        let result = cleanup_optimize_dry_run(&input, scratch.path(), &options())
            .await
            .unwrap();

        assert_eq!(result, input);
        assert!(!scratch.path().join("clean.pdf").exists());
        assert_eq!(std::fs::read(&input).unwrap(), source);
    }
    #[test]
    fn heuristic_new_object_streams_save_ten_percent_of_non_image_bytes() {
        let inventory = PdfInventory {
            total_bytes: 1_000_000,
            image_streams: vec![ImageInventory {
                stream_bytes: 400_000,
                dpi: Some(300.0),
            }],
            has_object_streams: false,
            unreferenced_objects: 0,
            object_count: 100,
        };
        let mut selected = options();
        selected.object_streams = true;

        let result = estimate_from_inventory(&inventory, &selected);

        assert_eq!(
            result.estimated_bytes, 940_000,
            "10% applies only to the 600,000 non-image bytes"
        );
        assert_eq!(result.method, EstimateMethod::Heuristic);
    }

    #[test]
    fn heuristic_combined_structural_savings_are_capped_at_twenty_five_percent() {
        let inventory = PdfInventory {
            total_bytes: 1_000_000,
            image_streams: vec![],
            has_object_streams: false,
            unreferenced_objects: 50,
            object_count: 100,
        };
        let mut selected = options();
        selected.object_streams = true;
        selected.remove_unused = true;
        selected.subset_fonts = true;
        selected.strip_metadata = true;
        selected.remove_form_data = true;

        let result = estimate_from_inventory(&inventory, &selected);

        assert_eq!(
            result.estimated_bytes, 750_000,
            "the fallback must not promise more than 25% structural savings"
        );
    }

    #[test]
    fn dry_run_result_uses_measured_sizes_without_clamping_growth() {
        let result = dry_run_result(1_000, 1_125);

        assert_eq!(result.current_bytes, 1_000);
        assert_eq!(
            result.estimated_bytes, 1_125,
            "a real dry run may reveal that optimization grows the file"
        );
        assert_eq!(result.method, EstimateMethod::DryRun);
    }
}
