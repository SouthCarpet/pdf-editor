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

    /// Resolves the directory holding the sidecar DLLs (`qpdf30.dll`,
    /// `libtesseract-5.dll`, `gsdll64.dll`, and siblings), so the child's
    /// `PATH` can be pointed at it. Same shape as `resolve_binary` above and
    /// the precedent helpers `TesseractWrapper::tessdata_dir`,
    /// `rapidocr::resource_root`, `SofficeWrapper::resolve`: exe-relative
    /// first (the installed/bundled layout, where `bundle.resources` lands
    /// the DLLs at `<exe dir>\sidecars\`), `CARGO_MANIFEST_DIR` fallback
    /// second (dev and `cargo build --release`, where `stage-sidecars.ps1`
    /// already staged the real DLLs into `src-tauri/sidecars/`).
    fn sidecar_dll_dir() -> PathBuf {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let candidate = dir.join("sidecars");
                if candidate.exists() {
                    return candidate;
                }
            }
        }
        std::env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("sidecars")
    }

    /// Builds the child `PATH` value: the resolved sidecar DLL directory
    /// prepended to whatever `PATH` this process already has, so the Windows
    /// loader finds `qpdf30.dll`/`libtesseract-5.dll`/`gsdll64.dll` even
    /// though the sidecar exe is not colocated with them.
    fn child_path_value() -> std::ffi::OsString {
        let mut value = std::ffi::OsString::from(Self::sidecar_dll_dir());
        if let Some(existing) = std::env::var_os("PATH") {
            value.push(";");
            value.push(existing);
        }
        value
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
        let _permit =
            self.semaphore
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
            .kill_on_drop(true);
        // Whitelist of env vars sidecars legitimately need. PATH for binary
        // resolution; TEMP/TMP because Ghostscript writes temp files and
        // errors with `Could not open temporary file ''` when they're empty;
        // SYSTEMROOT/WINDIR for Win32 calls; USERPROFILE/LOCALAPPDATA/APPDATA
        // for font and config lookup; COMSPEC for shell-spawn fallback.
        for var in [
            "PATH",
            "TEMP",
            "TMP",
            "TMPDIR",
            "SYSTEMROOT",
            "WINDIR",
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "COMSPEC",
            "HOME",
        ] {
            if var == "PATH" {
                // Prepend the resolved sidecar DLL dir so the loader finds
                // qpdf30.dll/libtesseract-5.dll/gsdll64.dll even when they
                // are not colocated with the sidecar exe (plan 036).
                cmd.env("PATH", Self::child_path_value());
                continue;
            }
            if let Some(val) = std::env::var_os(var) {
                cmd.env(var, val);
            }
        }

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

#[cfg(test)]
mod tests {
    use super::*;

    /// RAII guard: creates `<current_exe dir>/sidecars` for the duration of
    /// the test (simulating the installed/bundled layout where
    /// `bundle.resources` lands the DLLs next to the exe), removes it on
    /// drop even on panic. This is the only test in the crate that touches
    /// that path, so it does not race other `#[cfg(test)]` code.
    struct ExeRelativeSidecarsDirGuard {
        path: PathBuf,
        created: bool,
    }

    impl ExeRelativeSidecarsDirGuard {
        fn create() -> Self {
            let exe = std::env::current_exe().expect("current_exe");
            let path = exe
                .parent()
                .expect("test binary has a parent dir")
                .join("sidecars");
            let created = !path.exists();
            if created {
                std::fs::create_dir(&path).expect("create marker sidecars dir");
            }
            Self { path, created }
        }
    }

    impl Drop for ExeRelativeSidecarsDirGuard {
        fn drop(&mut self) {
            if self.created {
                let _ = std::fs::remove_dir(&self.path);
            }
        }
    }

    #[test]
    fn sidecar_dll_dir_resolves_exe_relative_when_present() {
        let guard = ExeRelativeSidecarsDirGuard::create();
        let resolved = SidecarManager::sidecar_dll_dir();
        assert_eq!(
            resolved, guard.path,
            "exe-relative sidecars dir must win when it exists"
        );
    }

    #[test]
    fn sidecar_dll_dir_falls_back_to_manifest_dir_when_absent() {
        let exe = std::env::current_exe().expect("current_exe");
        let exe_relative = exe.parent().expect("parent").join("sidecars");
        assert!(
            !exe_relative.exists(),
            "precondition: {} must not exist for this test",
            exe_relative.display()
        );

        let resolved = SidecarManager::sidecar_dll_dir();
        let expected = std::env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("sidecars");
        assert_eq!(resolved, expected);
    }

    #[test]
    fn child_path_begins_with_resolved_sidecar_dll_dir() {
        let dll_dir = SidecarManager::sidecar_dll_dir();
        let path_value = SidecarManager::child_path_value();
        let path_str = path_value.to_string_lossy();
        let dll_dir_str = dll_dir.to_string_lossy();
        assert!(
            path_str.starts_with(dll_dir_str.as_ref()),
            "child PATH does not begin with the resolved sidecar DLL dir.\n  dll_dir: {dll_dir_str}\n  PATH:    {path_str}"
        );
    }
}
