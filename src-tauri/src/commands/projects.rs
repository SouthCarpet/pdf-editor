// Phase 15 Task 78 — Project CRUD commands.
//
// Wraps the persistence::projects layer. Each command is a thin async
// adapter around an sqlx call. All eleven commands are registered with
// the specta builder in lib.rs so the frontend gets typed entry points.
use crate::app_state::AppState;
use crate::error::AppResult;
use crate::persistence::projects::{
    add_project_file, add_project_pipeline, create_project, delete_project, get_project,
    list_project_files, list_project_pipelines, list_projects, remove_project_file,
    remove_project_pipeline, update_project, NewProject, Project,
};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn project_create(state: State<'_, AppState>, p: NewProject) -> AppResult<i64> {
    Ok(create_project(&state.pool, &p).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_list(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    Ok(list_projects(&state.pool).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_get(state: State<'_, AppState>, id: i64) -> AppResult<Option<Project>> {
    Ok(get_project(&state.pool, id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_update(state: State<'_, AppState>, p: Project) -> AppResult<()> {
    Ok(update_project(&state.pool, &p).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_delete(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    Ok(delete_project(&state.pool, id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_add_file(
    state: State<'_, AppState>,
    project_id: i64,
    path: String,
) -> AppResult<()> {
    Ok(add_project_file(&state.pool, project_id, &path).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_remove_file(
    state: State<'_, AppState>,
    project_id: i64,
    path: String,
) -> AppResult<()> {
    Ok(remove_project_file(&state.pool, project_id, &path).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_list_files(
    state: State<'_, AppState>,
    project_id: i64,
) -> AppResult<Vec<String>> {
    Ok(list_project_files(&state.pool, project_id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_add_pipeline(
    state: State<'_, AppState>,
    project_id: i64,
    preset_id: i64,
) -> AppResult<()> {
    Ok(add_project_pipeline(&state.pool, project_id, preset_id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_remove_pipeline(
    state: State<'_, AppState>,
    project_id: i64,
    preset_id: i64,
) -> AppResult<()> {
    Ok(remove_project_pipeline(&state.pool, project_id, preset_id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn project_list_pipelines(
    state: State<'_, AppState>,
    project_id: i64,
) -> AppResult<Vec<i64>> {
    Ok(list_project_pipelines(&state.pool, project_id).await?)
}
