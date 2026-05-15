// Phase 10 Task 57: open_document + save_document.
//
// Delta N (resolved on MSVC): `#[tauri::command] #[specta::specta]` are
// placed directly here in the lib. No main.rs wrapper needed.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::persistence::recent_files::{add_recent, RecentFile};
use crate::services::workspace::{inspect_document, OpenedDocument};
use chrono::Utc;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn open_document(state: State<'_, AppState>, path: String) -> AppResult<OpenedDocument> {
    let p = PathBuf::from(&path);
    let opened = tokio::task::spawn_blocking(move || inspect_document(&p))
        .await
        .map_err(|e| AppError::Internal {
            detail: format!("join: {e}"),
        })??;

    let display_name = PathBuf::from(&opened.path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    add_recent(
        &state.pool,
        &RecentFile {
            path: opened.path.clone(),
            display_name,
            last_opened_at: Utc::now(),
            page_count: Some(opened.page_count as i64),
            size_bytes: Some(opened.size_bytes as i64),
        },
    )
    .await
    .map_err(|e| AppError::Internal {
        detail: format!("{e:#}"),
    })?;

    Ok(opened)
}

#[tauri::command]
#[specta::specta]
pub async fn save_document(
    _state: State<'_, AppState>,
    source_path: String,
    target_path: String,
) -> AppResult<()> {
    tokio::fs::copy(&source_path, &target_path)
        .await
        .map_err(AppError::from)?;
    Ok(())
}
