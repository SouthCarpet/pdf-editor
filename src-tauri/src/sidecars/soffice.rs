use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::error::{AppError, AppResult};

const SOFFICE_RELATIVE: &str = "resources/libreoffice/App/libreoffice/program/soffice.exe";

pub struct SofficeWrapper {
    _mgr: crate::sidecars::manager::SidecarManager,
}

impl SofficeWrapper {
    pub fn new(mgr: crate::sidecars::manager::SidecarManager) -> Self {
        Self { _mgr: mgr }
    }

    fn resolve() -> PathBuf {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(p) = exe.parent() {
                let rel = p.join(SOFFICE_RELATIVE);
                if rel.exists() {
                    return rel;
                }
            }
        }
        let workspace = std::env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));
        workspace.join(SOFFICE_RELATIVE)
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
        let bin = Self::resolve();
        let user_profile = out_dir.join(".lo-profile");
        std::fs::create_dir_all(&user_profile).ok();

        let mut cmd = Command::new(&bin);
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

        let fut = cmd.output();
        let out = match cancel {
            Some(token) => tokio::select! {
                _ = token.cancelled() => { warn!("soffice cancelled"); return Err(AppError::Cancelled); }
                r = tokio::time::timeout(Duration::from_secs(180), fut) => r.map_err(|_| AppError::SidecarFailed { tool: "soffice".into(), exit_code: -2, stderr_tail: "timeout".into() })?
                    .map_err(|e| AppError::IoError { detail: e.to_string() })?,
            },
            None => tokio::time::timeout(Duration::from_secs(180), fut)
                .await
                .map_err(|_| AppError::SidecarFailed {
                    tool: "soffice".into(),
                    exit_code: -2,
                    stderr_tail: "timeout".into(),
                })?
                .map_err(|e| AppError::IoError {
                    detail: e.to_string(),
                })?,
        };

        if !out.status.success() {
            return Err(AppError::SidecarFailed {
                tool: "soffice".into(),
                exit_code: out.status.code().unwrap_or(-1),
                stderr_tail: String::from_utf8_lossy(&out.stderr)
                    .chars()
                    .rev()
                    .take(500)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect(),
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
