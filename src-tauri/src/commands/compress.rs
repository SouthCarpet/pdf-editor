// Phase 9 Task 52 — Compress tool. Drives Ghostscript via the
// `GhostscriptWrapper` (Phase 4). Three presets (Recommended / High /
// Maximum) map to `-dPDFSETTINGS=/ebook|/screen` plus tuned DPI + JPEG
// quality (see `sidecars::ghostscript::CompressionPreset`). Reports the
// before/after byte counts so the React layer can show "Saved X%".
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::sidecars::ghostscript::CompressionPreset;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum CompressionPresetDto {
    Recommended,
    High,
    Maximum,
}

impl From<CompressionPresetDto> for CompressionPreset {
    fn from(d: CompressionPresetDto) -> Self {
        match d {
            CompressionPresetDto::Recommended => CompressionPreset::Recommended,
            CompressionPresetDto::High => CompressionPreset::High,
            CompressionPresetDto::Maximum => CompressionPreset::Maximum,
        }
    }
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct CompressArgs {
    pub input: String,
    pub output: String,
    pub preset: CompressionPresetDto,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct CompressResult {
    pub output_paths: Vec<String>,
    pub before_bytes: u64,
    pub after_bytes: u64,
}

#[tauri::command]
#[specta::specta]
pub async fn compress_pdf_cmd(
    state: State<'_, AppState>,
    args: CompressArgs,
) -> AppResult<CompressResult> {
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let before_bytes = std::fs::metadata(&input)
        .map_err(|e| AppError::IoError { detail: e.to_string() })?
        .len();

    let token = state.cancellation.register(&args.job_id);
    state
        .gs
        .compress(&input, &output, args.preset.into(), Some(token))
        .await?;
    state.cancellation.forget(&args.job_id);

    let after_bytes = std::fs::metadata(&output)
        .map_err(|e| AppError::IoError { detail: e.to_string() })?
        .len();
    Ok(CompressResult {
        output_paths: vec![args.output],
        before_bytes,
        after_bytes,
    })
}
