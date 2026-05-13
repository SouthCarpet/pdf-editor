// Phase 11 Task 63 — Organize tool commands.
//
// Three thin wrappers + an "insert blank page" helper. Each maps to a
// dedicated `services::pdf_editor` function and runs inside
// `spawn_blocking` because lopdf I/O is synchronous.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::pdf_editor::{
    delete_pages, insert_blank_page, reorder_pages, rotate_pages,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OrganizeResult {
    pub output_paths: Vec<String>,
}

// ---------- Rotate ----------

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct RotateArgs {
    pub input: String,
    pub output: String,
    /// Tuple list (page_number_1based, rotation_degrees).
    pub rotations: Vec<(u32, i64)>,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn rotate_pages_cmd(
    state: State<'_, AppState>,
    args: RotateArgs,
) -> AppResult<OrganizeResult> {
    let _token = state.cancellation.register(&args.job_id);
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let rotations = args.rotations.clone();
    tokio::task::spawn_blocking(move || rotate_pages(&input, &rotations, &output))
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
    state.cancellation.forget(&args.job_id);
    Ok(OrganizeResult {
        output_paths: vec![args.output],
    })
}

// ---------- Delete pages ----------

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct DeletePagesArgs {
    pub input: String,
    pub output: String,
    pub pages: Vec<u32>,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn delete_pages_cmd(
    state: State<'_, AppState>,
    args: DeletePagesArgs,
) -> AppResult<OrganizeResult> {
    let _token = state.cancellation.register(&args.job_id);
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let pages = args.pages.clone();
    tokio::task::spawn_blocking(move || delete_pages(&input, &pages, &output))
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
    state.cancellation.forget(&args.job_id);
    Ok(OrganizeResult {
        output_paths: vec![args.output],
    })
}

// ---------- Reorder pages ----------

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ReorderArgs {
    pub input: String,
    pub output: String,
    pub new_order: Vec<u32>,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn reorder_pages_cmd(
    state: State<'_, AppState>,
    args: ReorderArgs,
) -> AppResult<OrganizeResult> {
    let _token = state.cancellation.register(&args.job_id);
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let order = args.new_order.clone();
    tokio::task::spawn_blocking(move || reorder_pages(&input, &order, &output))
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
    state.cancellation.forget(&args.job_id);
    Ok(OrganizeResult {
        output_paths: vec![args.output],
    })
}

// ---------- Insert blank page ----------

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct InsertBlankPageArgs {
    pub input: String,
    pub output: String,
    /// Insert a blank page AFTER this 0-based page index. Use `-1` (or
    /// `0` with `after_page_index = -1` equivalent) to insert at the
    /// beginning. The Rust side normalizes negative indices to 0.
    pub after_page_index: i32,
    pub width: f32,
    pub height: f32,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn insert_blank_page_cmd(
    state: State<'_, AppState>,
    args: InsertBlankPageArgs,
) -> AppResult<OrganizeResult> {
    let _token = state.cancellation.register(&args.job_id);
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let after = args.after_page_index.max(0) as u32;
    let w = args.width;
    let h = args.height;
    tokio::task::spawn_blocking(move || insert_blank_page(&input, after, &output, w, h))
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
    state.cancellation.forget(&args.job_id);
    Ok(OrganizeResult {
        output_paths: vec![args.output],
    })
}
