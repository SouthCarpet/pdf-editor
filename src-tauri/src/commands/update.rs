//! About, update-check and update-install commands (plan 119).
//!
//! The release check runs only through `check_for_update`, which reads the
//! stored consent itself. The frontend calls it at app start, when About
//! opens and from the manual button; every path meets the same gate here.
//! `download_update` reads the same consent before it sends anything, and
//! `install_update` starts only the setup that `download_update` verified.
use crate::error::{AppError, AppResult};
use crate::persistence::settings;
use crate::services::release_check::{self, UpdateCheck};
use crate::services::update_install::{self, UpdateInstall, UpdateInstallStatus, VerifiedSetup};
use crate::util::paths::settings_path;
use serde::Serialize;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The setup the last `download_update` verified. `install_update` starts
/// only this file, never a path from the frontend.
static VERIFIED_SETUP: Mutex<Option<VerifiedSetup>> = Mutex::new(None);

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
    check_for_update_with(settings_path().ok(), release_check::send_request).await
}

/// The body of `check_for_update`: reads the consent from `settings` (no
/// path counts as off) and only then lets `send` run.
pub async fn check_for_update_with<F, Fut>(settings: Option<PathBuf>, send: F) -> UpdateCheck
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<(u16, Vec<u8>), String>>,
{
    let consent = stored_consent(settings).await;
    release_check::check_with(consent, env!("CARGO_PKG_VERSION"), send).await
}

/// No settings path counts as off.
async fn stored_consent(settings: Option<PathBuf>) -> bool {
    match settings {
        Some(path) => settings::update_check_enabled(&path).await,
        None => false,
    }
}

/// Downloads and verifies the setup of release `tag` (the tag the check
/// showed) to `%TEMP%\pdf-editor-update\`. Only after a click on
/// **Update**; the frontend asks about unsaved work first.
#[tauri::command]
#[specta::specta]
pub async fn download_update(tag: String) -> UpdateInstall {
    let consent = stored_consent(settings_path().ok()).await;
    let dest = std::env::temp_dir().join("pdf-editor-update");
    let result = update_install::download_update_with(
        consent,
        &tag,
        &dest,
        release_check::send_request,
        &release_check::HttpDownload,
        |path: &Path| std::fs::File::create(path),
    )
    .await;
    match result {
        Ok(setup) => {
            let reply = UpdateInstall::ready(&setup);
            *VERIFIED_SETUP.lock().unwrap_or_else(|e| e.into_inner()) = Some(setup);
            reply
        }
        Err(failure) => UpdateInstall::failed(failure),
    }
}

/// Hashes the verified setup again, starts it with its wizard (no silent
/// switches) and exits the app so the setup can replace its files.
#[tauri::command]
#[specta::specta]
pub fn install_update(app: tauri::AppHandle) -> UpdateInstall {
    let verified = VERIFIED_SETUP
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let Some(setup) = verified else {
        return UpdateInstall::failed(update_install::Failure {
            status: UpdateInstallStatus::NoSetup,
            detail: "download the update first".into(),
        });
    };
    match update_install::start_verified(&setup, &update_install::run_setup) {
        Ok(()) => {
            app.exit(0);
            UpdateInstall::started(&setup)
        }
        Err(failure) => UpdateInstall::failed(failure),
    }
}
