//! About and update-check commands (plan 119).
//!
//! The release check runs only through `check_for_update`, which reads the
//! stored consent itself. The frontend calls it at app start, when About
//! opens and from the manual button; every path meets the same gate here.
use crate::error::{AppError, AppResult};
use crate::persistence::settings;
use crate::services::release_check::{self, UpdateCheck};
use crate::util::paths::settings_path;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct BuildInfo {
    /// Release version of this build (`X.Y.Z`).
    pub version: String,
    /// Git commit the build was made from, or `unknown`.
    pub commit: String,
    /// The build had uncommitted changes.
    pub dirty: bool,
}

fn internal(error: impl std::fmt::Display) -> AppError {
    AppError::Internal {
        detail: error.to_string(),
    }
}

#[tauri::command]
#[specta::specta]
pub fn build_info() -> BuildInfo {
    BuildInfo {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        commit: option_env!("PDF_EDITOR_BUILD_COMMIT")
            .unwrap_or("unknown")
            .to_owned(),
        dirty: option_env!("PDF_EDITOR_BUILD_DIRTY") == Some("true"),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_update_check_enabled() -> AppResult<bool> {
    let path = settings_path().map_err(internal)?;
    Ok(settings::update_check_enabled(&path).await)
}

#[tauri::command]
#[specta::specta]
pub async fn set_update_check_enabled(enabled: bool) -> AppResult<()> {
    let path = settings_path().map_err(internal)?;
    settings::set_update_check_enabled(&path, enabled)
        .await
        .map_err(|e| AppError::IoError {
            detail: format!("{e:#}"),
        })
}

#[tauri::command]
#[specta::specta]
pub async fn check_for_update() -> UpdateCheck {
    let consent = match settings_path() {
        Ok(path) => settings::update_check_enabled(&path).await,
        Err(_) => false,
    };
    release_check::check_with(
        consent,
        env!("CARGO_PKG_VERSION"),
        release_check::send_request,
    )
    .await
}
