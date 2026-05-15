// Meta commands: recent files list/remove + cancel a running job + crash
// logging endpoints (Delta P).
//
// Delta N MSVC test: with the MSVC toolchain (link.exe), `#[tauri::command]`
// inside `pdf_editor_lib` no longer pulls `tauri::Wry` runtime symbols
// into integration tests in a way that triggers STATUS_ENTRYPOINT_NOT_FOUND.
// Phase 7 Task 45 was the first place we exercised this and it passed.
use serde::Deserialize;
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
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        })
}

#[tauri::command]
#[specta::specta]
pub async fn recent_files_remove(state: State<'_, AppState>, path: String) -> AppResult<()> {
    recent_files::remove_recent(&state.pool, &path)
        .await
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        })
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_job(state: State<'_, AppState>, job_id: String) -> AppResult<()> {
    state.cancellation.cancel(&job_id);
    Ok(())
}

// Delta P: Frontend crash payload + the command the JS-side crashHandler
// invokes. Serialization is symmetric — we accept the payload as-is and
// pretty-print it into a `<timestamp>.frontend.txt` next to the Rust
// panic/crash files so a single directory contains the full incident
// timeline. `kind` distinguishes window.onerror from unhandledrejection.
#[derive(Debug, Clone, Deserialize, serde::Serialize, specta::Type)]
pub struct FrontendErrorPayload {
    pub message: String,
    pub source: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub stack: Option<String>,
    /// "error" (window.onerror) or "unhandledrejection".
    pub kind: String,
}

#[tauri::command]
#[specta::specta]
pub async fn record_frontend_error(
    _state: State<'_, AppState>,
    payload: FrontendErrorPayload,
) -> AppResult<()> {
    use crate::util::crash_logger::write_crash_file;
    use crate::util::paths::logs_dir;

    let dir = logs_dir().map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    let body = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "<serialize fail>".into());
    write_crash_file(&dir, "frontend", &body);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn open_logs_folder() -> AppResult<()> {
    use crate::util::paths::logs_dir;
    let dir = logs_dir().map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    // explorer.exe accepts a directory path directly; spawn instead of
    // status() so we don't block the IPC thread waiting for the window.
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| AppError::Internal {
            detail: format!("spawn explorer: {e}"),
        })?;
    Ok(())
}
