// Meta commands: recent files list/remove + cancel a running job.
//
// Delta N MSVC test: with the MSVC toolchain (link.exe), `#[tauri::command]`
// inside `pdf_editor_lib` should no longer pull `tauri::Wry` runtime symbols
// into integration tests in a way that triggers STATUS_ENTRYPOINT_NOT_FOUND.
// Phase 7 Task 45 is the first place we exercise this — if `cargo test`
// breaks here, fall back to the wrapper pattern (lib fns + main.rs wrappers).
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::persistence::recent_files::{self, RecentFile};

#[tauri::command]
#[specta::specta]
pub async fn recent_files_list(
    state: State<'_, AppState>,
    limit: i64,
) -> AppResult<Vec<RecentFile>> {
    recent_files::list_recent(&state.pool, limit)
        .await
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })
}

#[tauri::command]
#[specta::specta]
pub async fn recent_files_remove(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<()> {
    recent_files::remove_recent(&state.pool, &path)
        .await
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_job(state: State<'_, AppState>, job_id: String) -> AppResult<()> {
    state.cancellation.cancel(&job_id);
    Ok(())
}
