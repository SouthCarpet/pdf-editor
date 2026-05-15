// Phase 9 Task 50 — Split tool. Per-range slicing using lopdf's
// `delete_pages`. Output filenames follow `{stem}_NN.pdf` produced by
// `pdf_editor::split_pdf` (Phase 5 Task 28).
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::pdf_editor::split_pdf;
use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct SplitArgs {
    pub input: String,
    pub ranges: Vec<[u32; 2]>,
    pub out_dir: String,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SplitResult {
    pub output_paths: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn split_pdf_cmd(state: State<'_, AppState>, args: SplitArgs) -> AppResult<SplitResult> {
    if args.ranges.is_empty() {
        return Err(AppError::InvalidArgument {
            detail: "no ranges provided".into(),
        });
    }
    let _token = state.cancellation.register(&args.job_id);
    let input = PathBuf::from(&args.input);
    let out_dir = PathBuf::from(&args.out_dir);
    let ranges: Vec<RangeInclusive<u32>> = args.ranges.iter().map(|[a, b]| *a..=*b).collect();

    let outputs: Vec<PathBuf> =
        tokio::task::spawn_blocking(move || split_pdf(&input, &ranges, &out_dir))
            .await
            .map_err(|e| AppError::Internal {
                detail: e.to_string(),
            })?
            .map_err(|e| AppError::Internal {
                detail: format!("{e:#}"),
            })?;

    state.cancellation.forget(&args.job_id);
    Ok(SplitResult {
        output_paths: outputs.iter().map(|p| p.display().to_string()).collect(),
    })
}
