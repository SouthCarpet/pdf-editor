// Phase 14 Task 76 — Pipeline preset CRUD commands.
//
// Five commands matching the persistence layer 1:1. The pipeline editor
// UI persists/loads draft graphs via these calls; each preset is just
// the graph JSON keyed by name + description.
use crate::app_state::AppState;
use crate::error::AppResult;
use crate::persistence::pipeline_presets::{
    create_preset, delete_preset, get_preset, list_presets, update_preset, NewPipelinePreset,
    PipelinePreset,
};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn pipeline_preset_create(
    state: State<'_, AppState>,
    p: NewPipelinePreset,
) -> AppResult<i64> {
    Ok(create_preset(&state.pool, &p).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn pipeline_preset_list(state: State<'_, AppState>) -> AppResult<Vec<PipelinePreset>> {
    Ok(list_presets(&state.pool).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn pipeline_preset_get(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<Option<PipelinePreset>> {
    Ok(get_preset(&state.pool, id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn pipeline_preset_update(
    state: State<'_, AppState>,
    p: PipelinePreset,
) -> AppResult<()> {
    Ok(update_preset(&state.pool, &p).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn pipeline_preset_delete(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    Ok(delete_preset(&state.pool, id).await?)
}
