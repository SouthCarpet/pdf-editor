use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::util::install_detect::LIBREOFFICE_DOWNLOAD_URL;

const SOFFICE_RELATIVE: &str = "resources/libreoffice/App/libreoffice/program/soffice.exe";

/// The error Office conversion returns when LibreOffice is not found.
pub fn libreoffice_missing() -> AppError {
    AppError::LibreofficeMissing {
        detail: LIBREOFFICE_DOWNLOAD_URL.to_owned(),
    }
}

#[cfg(windows)]
fn installed_soffice() -> Option<PathBuf> {
    crate::util::install_detect::find_libreoffice(
        &crate::util::install_detect::WindowsRegistry,
        Path::is_file,
    )
}

#[cfg(not(windows))]
fn installed_soffice() -> Option<PathBuf> {
    None
}

pub struct SofficeWrapper {
    _mgr: crate::sidecars::manager::SidecarManager,
}

impl SofficeWrapper {
    pub fn new(mgr: crate::sidecars::manager::SidecarManager) -> Self {
        Self { _mgr: mgr }
    }

    /// A portable tree next to the app (developer builds), then the
    /// LibreOffice install the registry lists (`install_detect`, the same
    /// rule the setup uses). `None` when neither exists.
    fn resolve() -> Option<PathBuf> {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf));
        let workspace = std::env::var("CARGO_MANIFEST_DIR").ok().map(PathBuf::from);
        exe_dir
            .into_iter()
            .chain(workspace)
            .map(|dir| dir.join(SOFFICE_RELATIVE))
            .find(|path| path.is_file())
            .or_else(installed_soffice)
    }

    pub async fn convert_to_pdf(
        &self,
        input: &Path,
        out_dir: &Path,
        cancel: Option<CancellationToken>,
    ) -> AppResult<PathBuf> {
        self.convert(input, out_dir, "pdf", cancel).await
    }

    pub async fn convert(
        &self,
        input: &Path,
        out_dir: &Path,
        target_format: &str,
        cancel: Option<CancellationToken>,
    ) -> AppResult<PathBuf> {
        let bin = Self::resolve().ok_or_else(libreoffice_missing)?;
        let user_profile = out_dir.join(".lo-profile");
        std::fs::create_dir_all(&user_profile).ok();

        let mut cmd = soffice_command(&bin, input, out_dir, target_format, &user_profile);
        let out = wait_for_soffice(&mut cmd, cancel).await?;

        if !out.status.success() {
            return Err(AppError::SidecarFailed {
                tool: "soffice".into(),
                exit_code: out.status.code().unwrap_or(-1),
                stderr_tail: super::manager::stderr_tail(&out.stderr),
            });
        }

        let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("out");
        let candidate = out_dir.join(format!("{stem}.{target_format}"));
        if !candidate.exists() {
            return Err(AppError::Internal {
                detail: format!(
                    "LibreOffice did not produce expected file {}",
                    candidate.display()
                ),
            });
        }
        Ok(candidate)
    }
}

fn soffice_command(
    bin: &Path,
    input: &Path,
    out_dir: &Path,
    target_format: &str,
    user_profile: &Path,
) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args([
        "--headless",
        "--norestore",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        target_format,
        "--outdir",
        &out_dir.to_string_lossy(),
        &input.to_string_lossy(),
    ])
    .arg(format!(
        "-env:UserInstallation=file:///{}",
        user_profile.to_string_lossy().replace('\\', "/")
    ))
    .env_clear()
    .env("PATH", std::env::var_os("PATH").unwrap_or_default())
    .kill_on_drop(true);
    cmd
}

fn soffice_timeout() -> AppError {
    AppError::SidecarFailed {
        tool: "soffice".into(),
        exit_code: -2,
        stderr_tail: "timeout".into(),
    }
}

async fn wait_for_soffice(
    cmd: &mut Command,
    cancel: Option<CancellationToken>,
) -> AppResult<std::process::Output> {
    let work = async {
        tokio::time::timeout(Duration::from_secs(180), cmd.output())
            .await
            .map_err(|_| soffice_timeout())?
            .map_err(|e| AppError::IoError {
                detail: e.to_string(),
            })
    };
    super::manager::or_cancelled(cancel, "soffice", work).await
}
