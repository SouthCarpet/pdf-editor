// Phase 9 Task 49 — Merge tool. Pure-Rust lopdf path (no sidecar), wrapped
// in `spawn_blocking` because lopdf's load/save are sync CPU/IO. The job_id
// is registered with the cancellation registry mostly for parity with the
// other tool commands — lopdf merges are short and don't poll a token, so
// cancellation here is best-effort (forgets on success). Validation requires
// at least 2 inputs (UI enforces this too, but defence in depth).
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::pdf_editor;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct MergeArgs {
    pub inputs: Vec<String>,
    pub output: String,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct MergeResult {
    pub output_paths: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn merge_pdfs_cmd(state: State<'_, AppState>, args: MergeArgs) -> AppResult<MergeResult> {
    if args.inputs.len() < 2 {
        return Err(AppError::InvalidArgument {
            detail: "need at least 2 files".into(),
        });
    }
    let _token = state.cancellation.register(&args.job_id);
    let inputs: Vec<PathBuf> = args.inputs.iter().map(PathBuf::from).collect();
    let output = PathBuf::from(&args.output);
    let output_for_thread = output.clone();
    tokio::task::spawn_blocking(move || pdf_editor::merge_pdfs(&inputs, &output_for_thread))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        })?;
    state.cancellation.forget(&args.job_id);
    Ok(MergeResult {
        output_paths: vec![args.output],
    })
}
