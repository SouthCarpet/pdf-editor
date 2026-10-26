// Phase 12 Task 67 — Edit Tier 2 (annotations) command.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::annotations::{save_annotations, Annotation, AnnotationRef};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ApplyAnnotsArgs {
    pub input: String,
    pub output: String,
    pub annotations: Vec<Annotation>,
    /// Plan 119 p1b: saved annotations in `input` that the new ones replace
    /// (an edited saved value). They are removed before the new ones are
    /// written.
    pub replaced: Vec<AnnotationRef>,
    pub job_id: String,
}

/// Returns the object of each written annotation, in the order of
/// `annotations`, so the frontend can replace one of them later.
#[tauri::command]
#[specta::specta]
pub async fn apply_annotations_cmd(
    state: State<'_, AppState>,
    args: ApplyAnnotsArgs,
) -> AppResult<Vec<Option<AnnotationRef>>> {
    let _token = state.cancellation.register(&args.job_id);
    let i = PathBuf::from(&args.input);
    let o = PathBuf::from(&args.output);
    let a = args.annotations.clone();
    let r = args.replaced.clone();
    let result = tokio::task::spawn_blocking(move || save_annotations(&i, &o, &a, &r))
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
