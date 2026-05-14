// Phase 17 Task 87 — Last session restore.
//
// Three commands wrap `persistence::last_session`:
//   - session_save: upsert one slot
//   - session_list: enumerate slots so the frontend can prompt
//     "Restore last session?" on app boot
//   - session_clear: wipe all slots when the user picks Discard
//
// `SessionSlot` is exported to the FFI via `specta::Type` so the
// TypeScript binding mirrors the SQLite row exactly. v1 ships with
// single-slot support (slot = 0); multi-tab restore is a follow-up.

use crate::app_state::AppState;
use crate::error::AppResult;
use crate::persistence::last_session::{
    clear_session, list_session, save_session_slot, SessionSlot,
};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn session_save(state: State<'_, AppState>, slot: SessionSlot) -> AppResult<()> {
    save_session_slot(&state.pool, &slot)
        .await
        .map_err(|e| crate::error::AppError::Internal { detail: e.to_string() })?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn session_list(state: State<'_, AppState>) -> AppResult<Vec<SessionSlot>> {
    list_session(&state.pool)
        .await
        .map_err(|e| crate::error::AppError::Internal { detail: e.to_string() })
}

#[tauri::command]
#[specta::specta]
pub async fn session_clear(state: State<'_, AppState>) -> AppResult<()> {
    clear_session(&state.pool)
        .await
        .map_err(|e| crate::error::AppError::Internal { detail: e.to_string() })?;
    Ok(())
}
