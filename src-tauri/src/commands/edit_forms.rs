// AcroForm read and fill commands.
//
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::forms::{read_form_fields, set_form_values, FormField, FormValueUpdate};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn read_form_fields_cmd(
    _state: State<'_, AppState>,
    path: String,
) -> AppResult<Vec<FormField>> {
    let p = PathBuf::from(path);
    tokio::task::spawn_blocking(move || read_form_fields(&p))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        })
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct SetFormArgs {
    pub input: String,
    pub output: String,
    pub updates: Vec<FormValueUpdate>,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn set_form_values_cmd(state: State<'_, AppState>, args: SetFormArgs) -> AppResult<()> {
    let _token = state.cancellation.register(&args.job_id);
    let i = PathBuf::from(&args.input);
    let o = PathBuf::from(&args.output);
    let updates = args.updates.clone();
    let result = tokio::task::spawn_blocking(move || set_form_values(&i, &o, &updates))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        });
    state.cancellation.forget(&args.job_id);
    result
}
