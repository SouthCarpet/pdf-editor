// Phase 12 Task 69 — Autosave Tauri commands.
//
// Thin wrappers around `persistence::autosave::*` that the frontend hits
// on an interval to persist in-flight edits to SQLite. On document open
// the frontend calls `autosave_get` to offer restoration; after a
// successful save-to-disk it calls `autosave_delete`.
use crate::app_state::AppState;
use crate::error::AppResult;
use crate::persistence::autosave;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn autosave_put(
    state: State<'_, AppState>,
    doc_path: String,
    patch_json: String,
) -> AppResult<()> {
    autosave::put_autosave(&state.pool, &doc_path, &patch_json).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn autosave_get(
    state: State<'_, AppState>,
    doc_path: String,
) -> AppResult<Option<String>> {
    Ok(autosave::get_autosave(&state.pool, &doc_path).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn autosave_delete(state: State<'_, AppState>, doc_path: String) -> AppResult<()> {
    autosave::delete_autosave(&state.pool, &doc_path).await?;
    Ok(())
}
