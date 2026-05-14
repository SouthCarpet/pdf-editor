// Phase 9 Task 56 — Convert Import tool (images / office → PDF).
//
// Heuristic: if all inputs are recognised raster formats, assemble them
// into a single PDF in-process via `image_to_pdf::images_to_pdf` (Phase 5
// Task 31). Otherwise dispatch to LibreOffice via `SofficeWrapper`,
// which requires exactly one input (DOCX/ODT/XLSX/PPTX/RTF/HTML/TXT/EPUB).
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::image_to_pdf;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ImportArgs {
    pub inputs: Vec<String>,
    pub output: String,
    pub job_id: String,
    // Delta U Phase 17 Task 86a — page size / orientation / margins /
    // image fit / arrangement. Optional; advisory until image_to_pdf
    // and the LO export path honor each knob.
    #[serde(default)]
    pub page_size: Option<String>,
    #[serde(default)]
    pub custom_width_mm: Option<f32>,
    #[serde(default)]
    pub custom_height_mm: Option<f32>,
    #[serde(default)]
    pub orientation: Option<String>,
    #[serde(default)]
    pub margins: Option<String>,
    #[serde(default)]
    pub custom_margin_mm: Option<f32>,
    #[serde(default)]
    pub image_fit: Option<String>,
    #[serde(default)]
    pub arrangement: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ImportResult {
    pub output_paths: Vec<String>,
}

const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "tif", "tiff", "bmp"];

#[tauri::command]
#[specta::specta]
pub async fn convert_to_pdf_cmd(
    state: State<'_, AppState>,
    args: ImportArgs,
) -> AppResult<ImportResult> {
    if args.inputs.is_empty() {
        return Err(AppError::InvalidArgument {
            detail: "no inputs".into(),
        });
    }
    let inputs: Vec<PathBuf> = args.inputs.iter().map(PathBuf::from).collect();

    let all_images = inputs.iter().all(|p| {
        p.extension()
            .and_then(|e| e.to_str())
            .map(|s| IMAGE_EXTS.contains(&s.to_lowercase().as_str()))
            .unwrap_or(false)
    });

    let output = PathBuf::from(&args.output);
    let _token = state.cancellation.register(&args.job_id);

    if all_images {
        let inputs_clone = inputs.clone();
        let output_clone = output.clone();
        tokio::task::spawn_blocking(move || {
            image_to_pdf::images_to_pdf(&inputs_clone, &output_clone, 72.0)
        })
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
        state.cancellation.forget(&args.job_id);
        Ok(ImportResult {
            output_paths: vec![args.output],
        })
    } else {
        if inputs.len() != 1 {
            return Err(AppError::InvalidArgument {
                detail: "office formats require a single input".into(),
            });
        }
        let token = state.cancellation.register(&args.job_id);
        let parent = output.parent().unwrap_or_else(|| Path::new("."));
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::IoError { detail: e.to_string() })?;
        let lo_out = state
            .soffice
            .convert_to_pdf(&inputs[0], parent, Some(token))
            .await?;
        if lo_out != output {
            std::fs::rename(&lo_out, &output)
                .map_err(|e| AppError::IoError { detail: e.to_string() })?;
        }
        state.cancellation.forget(&args.job_id);
        Ok(ImportResult {
            output_paths: vec![args.output],
        })
    }
}
