// Phase 12 Task 66 — Edit Tier 1 (AcroForm fill) commands.
//
// Two Tauri commands:
//   - `read_form_fields_cmd(path)` → list of FormField records for UI.
//   - `set_form_values_cmd(args)`  → write `/V` for matched widgets.
//
// Per Delta N we keep the `#[tauri::command]` annotation in the lib only
// where it has already been proven safe on this toolchain (post-MSVC
// switch). All Phase 11 commands use this pattern; we follow suit here.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::forms::{read_form_fields, set_form_values, FormField};
use serde::Deserialize;
use std::collections::HashMap;
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
    pub values: HashMap<String, String>,
    pub job_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn set_form_values_cmd(state: State<'_, AppState>, args: SetFormArgs) -> AppResult<()> {
    let _token = state.cancellation.register(&args.job_id);
    let i = PathBuf::from(&args.input);
    let o = PathBuf::from(&args.output);
    let v = args.values.clone();
    let result = tokio::task::spawn_blocking(move || set_form_values(&i, &o, &v))
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
