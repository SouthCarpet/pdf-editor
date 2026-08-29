use crate::app_state::AppState;
use crate::error::AppResult;
use crate::services::form_field_detection::{detect_scanned_form_fields, DetectedFormField};
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn detect_scanned_form_fields_cmd(
    state: State<'_, AppState>,
    path: String,
    page_index: u32,
    dpi: u32,
) -> AppResult<Vec<DetectedFormField>> {
    detect_scanned_form_fields(&state.mupdf, &PathBuf::from(path), page_index, dpi)
        .await
        .map(|analysis| analysis.fields)
}
