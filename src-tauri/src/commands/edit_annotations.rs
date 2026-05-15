// Phase 12 Task 67 — Edit Tier 2 (annotations) command.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::annotations::{apply_annotations, Annotation};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ApplyAnnotsArgs {
    pub input: String,
    pub output: String,
    pub annotations: Vec<Annotation>,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn apply_annotations_cmd(
    state: State<'_, AppState>,
    args: ApplyAnnotsArgs,
) -> AppResult<()> {
    let _token = state.cancellation.register(&args.job_id);
    let i = PathBuf::from(&args.input);
    let o = PathBuf::from(&args.output);
    let a = args.annotations.clone();
    let result = tokio::task::spawn_blocking(move || apply_annotations(&i, &o, &a))
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
