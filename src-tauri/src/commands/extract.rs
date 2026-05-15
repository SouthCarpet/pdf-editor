// Phase 9 Task 51 — Extract Pages tool. Selects a sparse page set and
// writes them to a single output PDF via `pdf_editor::extract_pages`.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::pdf_editor::extract_pages;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ExtractArgs {
    pub input: String,
    pub pages: Vec<u32>,
    pub output: String,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ExtractResult {
    pub output_paths: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn extract_pages_cmd(
    state: State<'_, AppState>,
    args: ExtractArgs,
) -> AppResult<ExtractResult> {
    if args.pages.is_empty() {
        return Err(AppError::InvalidArgument {
            detail: "no pages specified".into(),
        });
    }
    let _token = state.cancellation.register(&args.job_id);
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let pages = args.pages.clone();
    let out_for_thread = output.clone();
    tokio::task::spawn_blocking(move || extract_pages(&input, &pages, &out_for_thread))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        })?;
    state.cancellation.forget(&args.job_id);
    Ok(ExtractResult {
        output_paths: vec![args.output],
    })
}
