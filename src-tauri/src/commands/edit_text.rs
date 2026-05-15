// Phase 12 Task 68 — Edit Tier 3 (real inline text edit, Delta S).
//
// `extract_runs_cmd` enumerates editable text runs the user can target.
// `replace_run_cmd` performs the real in-place Tj/TJ operand rewrite with
// proper encoding inversion. `replace_run_redaction_cmd` is the explicit
// opt-in fallback — the frontend warns before invoking it.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::text_edit::{extract_runs, replace_run, replace_run_via_redaction, TextRun};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn extract_runs_cmd(
    _state: State<'_, AppState>,
    path: String,
) -> AppResult<Vec<TextRun>> {
    let p = PathBuf::from(path);
    tokio::task::spawn_blocking(move || extract_runs(&p))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        })
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ReplaceRunArgs {
    pub input: String,
    pub output: String,
    pub page_index: u32,
    pub operator_index: u32,
    pub new_text: String,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn replace_run_cmd(state: State<'_, AppState>, args: ReplaceRunArgs) -> AppResult<()> {
    let _token = state.cancellation.register(&args.job_id);
    let i = PathBuf::from(&args.input);
    let o = PathBuf::from(&args.output);
    let p = args.page_index;
    let op = args.operator_index;
    let t = args.new_text.clone();
    let result = tokio::task::spawn_blocking(move || replace_run(&i, &o, p, op, &t))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
    state.cancellation.forget(&args.job_id);
    result
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct RedactReplaceArgs {
    pub input: String,
    pub output: String,
    pub page_index: u32,
    pub rect: [f32; 4],
    pub new_text: String,
    pub font_size: f32,
    pub job_id: String,
}

/// Explicit opt-in fallback — used only when the user clicks "redact-style"
/// after seeing a clear EncodingMismatch banner. The frontend never
/// invokes this silently.
#[tauri::command]
#[specta::specta]
pub async fn replace_run_redaction_cmd(
    state: State<'_, AppState>,
    args: RedactReplaceArgs,
) -> AppResult<()> {
    let _token = state.cancellation.register(&args.job_id);
    let i = PathBuf::from(&args.input);
    let o = PathBuf::from(&args.output);
    let p = args.page_index;
    let r = args.rect;
    let t = args.new_text.clone();
    let f = args.font_size;
    let result =
        tokio::task::spawn_blocking(move || replace_run_via_redaction(&i, &o, p, r, &t, f))
            .await
            .map_err(|e| AppError::Internal {
                detail: e.to_string(),
            })?
            .map_err(|e| AppError::Internal {
                detail: format!("{e:#}"),
            });
    state.cancellation.forget(&args.job_id);
    result
}
