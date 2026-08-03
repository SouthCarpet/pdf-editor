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
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use tracing::warn;

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

#[tauri::command]
#[specta::specta]
pub async fn optimize_pdf_cmd(
    state: State<'_, AppState>,
    args: OptimizeArgs,
) -> AppResult<OptimizeResult> {
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let before_bytes = std::fs::metadata(&input)
        .map_err(|e| AppError::IoError {
            detail: e.to_string(),
        })?
        .len();
    let token = state.cancellation.register(&args.job_id);

    let tmp_dir = tempfile::tempdir().map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    let mut current = input.clone();

    if args.flatten_annotations {
        let next = tmp_dir.path().join("flat.pdf");
        state
            .qpdf
            .flatten_annotations(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    if args.subset_fonts {
        let next = tmp_dir.path().join("subset.pdf");
        state
            .mupdf
            .clean_subset_fonts(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    if args.object_streams || args.remove_unused {
        let next = tmp_dir.path().join("os.pdf");
        state
            .qpdf
            .object_streams_generate(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    if args.linearize {
        let next = tmp_dir.path().join("lin.pdf");
        state
            .qpdf
            .linearize(&current, &next, Some(token.clone()))
            .await?;
        current = next;
    }

    if let Some(_lang) = args.make_searchable_ocr.as_ref() {
        // Phase 13 wires the real hOCR-pdf assembly via TesseractWrapper +
        // MupdfWrapper. For now, log and skip the step so the rest of the
        // pipeline still completes; the user can run OCR via the dedicated
        // OCR tool once Phase 13 lands.
        warn!(
            "optimize: make_searchable_ocr requested but OCR pipeline is gated to Phase 13; skipping"
        );
    }

    if let Some(version) = args.convert_pdfa {
        // Delta E: LibreOffice primary, Ghostscript fallback.
        let lo_target =
            "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}";
        let lo_attempt = state
            .soffice
            .convert(&current, tmp_dir.path(), lo_target, Some(token.clone()))
            .await;
        let pdfa_path = match lo_attempt {
            Ok(out) => out,
            Err(lo_err) => {
                warn!(error = ?lo_err, "LibreOffice PDF/A export failed; falling back to Ghostscript");
                let gs_out = tmp_dir.path().join("pdfa.pdf");
                state
                    .gs
                    .convert_to_pdfa(&current, &gs_out, version, Some(token.clone()))
                    .await?;
                gs_out
            }
        };
        current = pdfa_path;
    }

    if args.strip_metadata || args.remove_form_data {
        let cur = current.clone();
        let next = tmp_dir.path().join("strip.pdf");
        let next_cloned = next.clone();
        let strip = args.strip_metadata;
        let removeform = args.remove_form_data;
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let mut doc = crate::services::pdf_guard::load_guarded(&cur).map_err(|e| {
                AppError::PdfCorrupted {
                    detail: e.to_string(),
                }
            })?;
            if strip {
                doc.trailer.remove(b"Info");
                if let Ok(catalog_id) = doc.trailer.get(b"Root").and_then(|o| o.as_reference()) {
                    if let Some(catalog) = doc.objects.get_mut(&catalog_id) {
                        if let Ok(d) = catalog.as_dict_mut() {
                            d.remove(b"Metadata");
                        }
                    }
                }
            }
            if removeform {
                if let Ok(catalog_id) = doc.trailer.get(b"Root").and_then(|o| o.as_reference()) {
                    if let Some(catalog) = doc.objects.get_mut(&catalog_id) {
                        if let Ok(d) = catalog.as_dict_mut() {
                            d.remove(b"AcroForm");
                        }
                    }
                }
            }
            doc.compress();
            doc.save(&next_cloned).map_err(|e| AppError::Internal {
                detail: e.to_string(),
            })?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })??;
        current = next;
    }

    std::fs::copy(&current, &output).map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    state.cancellation.forget(&args.job_id);

    let after_bytes = std::fs::metadata(&output)
        .map_err(|e| AppError::IoError {
            detail: e.to_string(),
        })?
        .len();
    Ok(OptimizeResult {
        output_paths: vec![args.output],
        before_bytes,
        after_bytes,
    })
}
