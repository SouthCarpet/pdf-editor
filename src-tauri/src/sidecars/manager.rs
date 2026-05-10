use std::path::PathBuf;
use std::process::{ExitStatus, Stdio};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use tracing::{debug, warn};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct SidecarRunSpec {
    pub name: String,
    pub args: Vec<String>,
    pub stdin: Option<Vec<u8>>,
    pub timeout: Option<Duration>,
    pub cancellation: Option<CancellationToken>,
}

#[derive(Debug)]
pub struct SidecarOutput {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

#[derive(Clone)]
pub struct SidecarManager {
    semaphore: Arc<Semaphore>,
}

impl SidecarManager {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent.max(1))),
        }
    }

    pub fn resolve_binary(&self, name: &str) -> PathBuf {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let p = dir.join(format!("{name}.exe"));
                if p.exists() {
                    return p;
                }
            }
        }
        let workspace = std::env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));
        // Try GNU suffix first (current host triple), then MSVC fallback.
        for suffix in &["x86_64-pc-windows-gnu", "x86_64-pc-windows-msvc"] {
            let candidate = workspace.join(format!("sidecars/{name}-{suffix}.exe"));
            if candidate.exists() {
                return candidate;
            }
        }
        workspace.join(format!("sidecars/{name}-x86_64-pc-windows-msvc.exe"))
    }

    pub async fn run(&self, spec: SidecarRunSpec) -> AppResult<SidecarOutput> {
        let _permit = self
            .semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| AppError::Internal {
                detail: e.to_string(),
            })?;
        let binary = self.resolve_binary(&spec.name);
        debug!(?binary, args = ?spec.args, "spawning sidecar");

        let mut cmd = Command::new(&binary);
        cmd.args(&spec.args)
            .stdin(if spec.stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| AppError::SidecarFailed {
            tool: spec.name.clone(),
            exit_code: -1,
            stderr_tail: format!("spawn: {e}"),
        })?;

        if let Some(bytes) = spec.stdin.as_ref() {
            if let Some(mut s) = child.stdin.take() {
                s.write_all(bytes).await.ok();
                s.shutdown().await.ok();
            }
        }

        let wait_fut = child.wait_with_output();

        let output = if let Some(token) = spec.cancellation.clone() {
            tokio::select! {
                out = wait_fut => out.map_err(|e| AppError::IoError { detail: e.to_string() })?,
                _ = token.cancelled() => {
                    warn!("sidecar {} cancelled", spec.name);
                    return Err(AppError::Cancelled);
                }
                _ = async {
                    if let Some(t) = spec.timeout { tokio::time::sleep(t).await; }
                    else { std::future::pending::<()>().await; }
                } => {
                    return Err(AppError::SidecarFailed {
                        tool: spec.name.clone(),
                        exit_code: -2,
                        stderr_tail: "timeout".into(),
                    });
                }
            }
        } else if let Some(t) = spec.timeout {
            match tokio::time::timeout(t, wait_fut).await {
                Ok(Ok(out)) => out,
                Ok(Err(e)) => {
                    return Err(AppError::IoError {
                        detail: e.to_string(),
                    })
                }
                Err(_) => {
                    return Err(AppError::SidecarFailed {
                        tool: spec.name.clone(),
                        exit_code: -2,
                        stderr_tail: "timeout".into(),
                    })
                }
            }
        } else {
            wait_fut.await.map_err(|e| AppError::IoError {
                detail: e.to_string(),
            })?
        };

        if !output.status.success() {
            let tail = String::from_utf8_lossy(&output.stderr);
            let tail: String = tail
                .chars()
                .rev()
                .take(500)
                .collect::<String>()
                .chars()
                .rev()
                .collect();
            return Err(AppError::SidecarFailed {
                tool: spec.name.clone(),
                exit_code: output.status.code().unwrap_or(-1),
                stderr_tail: tail,
            });
        }

        Ok(SidecarOutput {
            status: output.status,
            stdout: output.stdout,
            stderr: output.stderr,
        })
    }
}
