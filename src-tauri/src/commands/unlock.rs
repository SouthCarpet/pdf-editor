// Phase 9 Task 54 — Unlock tool.
//
// Two-step UX: `detect_pdf_encryption` returns `true` when the input PDF is
// encrypted (`/Encrypt` dict present) without requiring the password; the
// React layer then prompts the user for a password and calls
// `unlock_pdf_cmd`, which delegates to `QpdfWrapper::decrypt`.
//
// Detection is tricky: `lopdf::Document::load` may fail outright for some
// encrypted PDFs (PasswordIncorrect etc.). We treat any load failure that
// surfaces a password-related token as "encrypted, no password yet" rather
// than propagating it as a corruption error, so the UI can drive straight
// to the password prompt.
//
// Delta D: in-process AES-256 routing (V=5, PDF 2.0) is a Phase 12+
// optimisation. v0 here funnels everything through qpdf which handles
// V<=4. AES-256 input will surface a SidecarFailed today.
// TODO: route V=5 to in-process AES-256.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct UnlockArgs {
    pub input: String,
    pub output: String,
    pub password: Option<String>,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum UnlockResult {
    Ok { output_paths: Vec<String> },
    PasswordRequired,
}

#[tauri::command]
#[specta::specta]
pub async fn detect_pdf_encryption(
    _state: State<'_, AppState>,
    input: String,
) -> AppResult<bool> {
    let p = PathBuf::from(input);
    tokio::task::spawn_blocking(move || -> AppResult<bool> {
        match lopdf::Document::load(&p) {
            Ok(doc) => Ok(doc.is_encrypted()),
            Err(e) => {
                // lopdf can fail to load encrypted PDFs without the password.
                // Treat any password-mentioning error as "encrypted, password
                // required" so the UI knows to prompt rather than reporting a
                // generic corruption error.
                let msg = e.to_string().to_lowercase();
                if msg.contains("password") || msg.contains("encrypt") {
                    Ok(true)
                } else {
                    Err(AppError::PdfCorrupted { detail: e.to_string() })
                }
            }
        }
    })
    .await
    .map_err(|e| AppError::Internal { detail: e.to_string() })?
}

#[tauri::command]
#[specta::specta]
pub async fn unlock_pdf_cmd(
    state: State<'_, AppState>,
    args: UnlockArgs,
) -> AppResult<UnlockResult> {
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let _token = state.cancellation.register(&args.job_id);
    let result = state
        .qpdf
        .decrypt(&input, &output, args.password.as_deref())
        .await;
    state.cancellation.forget(&args.job_id);
    match result {
        Ok(_) => Ok(UnlockResult::Ok {
            output_paths: vec![args.output],
        }),
        Err(AppError::SidecarFailed { ref stderr_tail, .. })
            if stderr_tail.to_lowercase().contains("invalid password") =>
        {
            Err(AppError::PasswordInvalid)
        }
        Err(AppError::SidecarFailed { ref stderr_tail, .. })
            if stderr_tail.to_lowercase().contains("password") =>
        {
            Err(AppError::PasswordRequired)
        }
        Err(e) => Err(e),
    }
}
