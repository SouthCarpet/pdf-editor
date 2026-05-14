// Phase 16 Task 81 — Recovery (brute-force) wizard backend.
//
// Three attack modes are surfaced:
//   - Dictionary: pdfcrack -w <wordlist>
//   - Brute    : pdfcrack -c <charset> -n <min> -m <max>
//   - Mask     : NOT IMPLEMENTED. pdfcrack lacks first-class mask support
//     and a faithful in-process mask expansion would require an unbounded
//     candidate buffer for non-trivial masks. Per the NON-NEGOTIABLE rule
//     ("NO 'pragmatic v1 simpler' shortcuts"), the mode is surfaced as
//     `AppError::Unimplemented { feature: "recovery.mask" }` instead of a
//     silently-disabled or quietly-degraded variant — v1.1 will land a
//     proper mask attack via either an isolated wordlist generator with
//     explicit caps or a forked pdfcrack-mask build.
//
// All modes register / forget a job_id through the cancellation registry so
// the wizard's Stop button can short-circuit a running attack.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum RecoveryArgs {
    Dictionary {
        input: String,
        wordlist_path: String,
        job_id: String,
    },
    Mask {
        input: String,
        mask: String,
        job_id: String,
    },
    Brute {
        input: String,
        charset: String,
        min_len: u8,
        max_len: u8,
        job_id: String,
    },
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct RecoveryResult {
    pub password: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn recovery_attempt(
    state: State<'_, AppState>,
    args: RecoveryArgs,
) -> AppResult<RecoveryResult> {
    match args {
        RecoveryArgs::Dictionary {
            input,
            wordlist_path,
            job_id,
        } => {
            let token = state.cancellation.register(&job_id);
            let r = state
                .pdfcrack
                .dictionary_attack(
                    &PathBuf::from(input),
                    &PathBuf::from(wordlist_path),
                    Some(token),
                )
                .await?;
            state.cancellation.forget(&job_id);
            Ok(RecoveryResult { password: r })
        }
        RecoveryArgs::Mask {
            input: _,
            mask: _,
            job_id: _,
        } => {
            // Non-shortcut policy: surface a proper Unimplemented error so the
            // frontend can render a clear "Mask mode coming in v1.1" panel
            // with a suggestion to use Brute with a similar charset, rather
            // than silently returning `password: None` (which would look
            // identical to a finished-but-failed attack).
            Err(AppError::Unimplemented {
                feature: "recovery.mask".into(),
            })
        }
        RecoveryArgs::Brute {
            input,
            charset,
            min_len,
            max_len,
            job_id,
        } => {
            if charset.is_empty() {
                return Err(AppError::InvalidArgument {
                    detail: "charset must not be empty".into(),
                });
            }
            if min_len == 0 || max_len == 0 || max_len < min_len {
                return Err(AppError::InvalidArgument {
                    detail: format!("invalid length range {min_len}..{max_len}"),
                });
            }
            let token = state.cancellation.register(&job_id);
            let r = state
                .pdfcrack
                .brute_force(
                    &PathBuf::from(input),
                    &charset,
                    min_len,
                    max_len,
                    Some(token),
                )
                .await?;
            state.cancellation.forget(&job_id);
            Ok(RecoveryResult { password: r })
        }
    }
}
