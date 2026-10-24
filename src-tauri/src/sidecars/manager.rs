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

pub(crate) fn stderr_tail(stderr: &[u8]) -> String {
    String::from_utf8_lossy(stderr)
        .chars()
        .rev()
        .take(500)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

/// Races `work` against `token`. A cancelled token logs `<label> cancelled`
/// and returns `AppError::Cancelled`; no token just awaits `work`.
pub(crate) async fn or_cancelled<T>(
    token: Option<CancellationToken>,
    label: &str,
    work: impl std::future::Future<Output = AppResult<T>>,
) -> AppResult<T> {
    let Some(token) = token else {
        return work.await;
    };
    tokio::select! {
        out = work => out,
        _ = token.cancelled() => {
            warn!("{label} cancelled");
            Err(AppError::Cancelled)
        }
    }
}

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
    /// `rapidocr::resource_root`, `SofficeWrapper::resolve`:
    /// `PDF_EDITOR_INSTALL_DIR` env override first (plan 047 gate, unset
    /// outside test), exe-relative next (the installed/bundled layout, where
    /// `bundle.resources` lands the DLLs at `<exe dir>\sidecars\`),
    /// `CARGO_MANIFEST_DIR` fallback last (dev and `cargo build --release`,
    /// where `stage-sidecars.ps1` already staged the real DLLs into
    /// `src-tauri/sidecars/`).
    fn sidecar_dll_dir() -> PathBuf {
        // Plan 047 gate override: point resolution at a real installed MSI
        // layout instead of the test binary's own directory. Unset in any
        // shipped install; only the gate test sets it.
        if let Ok(dir) = std::env::var("PDF_EDITOR_INSTALL_DIR") {
            return PathBuf::from(dir).join("sidecars");
        }
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
        // Plan 047 gate override: see `sidecar_dll_dir` above.
        if let Ok(dir) = std::env::var("PDF_EDITOR_INSTALL_DIR") {
            let p = PathBuf::from(&dir).join(format!("{name}.exe"));
            if p.exists() {
                return p;
            }
        }
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

    fn sidecar_command(binary: &std::path::Path, spec: &SidecarRunSpec) -> Command {
        let mut cmd = Command::new(binary);
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
        cmd
    }

    async fn wait_for_output(
        child: tokio::process::Child,
        spec: &SidecarRunSpec,
    ) -> AppResult<std::process::Output> {
        let work = Self::wait_with_timeout(child, spec);
        let label = format!("sidecar {}", spec.name);
        or_cancelled(spec.cancellation.clone(), &label, work).await
    }

    async fn wait_with_timeout(
        child: tokio::process::Child,
        spec: &SidecarRunSpec,
    ) -> AppResult<std::process::Output> {
        let wait_fut = child.wait_with_output();
        let finished =
            match spec.timeout {
                Some(t) => tokio::time::timeout(t, wait_fut).await.map_err(|_| {
                    AppError::SidecarFailed {
                        tool: spec.name.clone(),
                        exit_code: -2,
                        stderr_tail: "timeout".into(),
                    }
                })?,
                None => wait_fut.await,
            };
        finished.map_err(|e| AppError::IoError {
            detail: e.to_string(),
        })
    }

    async fn spawn_with_stdin(
        mut cmd: Command,
        spec: &SidecarRunSpec,
    ) -> AppResult<tokio::process::Child> {
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
        Ok(child)
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

        let cmd = Self::sidecar_command(&binary, &spec);
        let child = Self::spawn_with_stdin(cmd, &spec).await?;

        let output = Self::wait_for_output(child, &spec).await?;

        if !output.status.success() {
            return Err(AppError::SidecarFailed {
                tool: spec.name.clone(),
                exit_code: output.status.code().unwrap_or(-1),
                stderr_tail: stderr_tail(&output.stderr),
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

    /// Serializes the tests below that touch `<current_exe dir>/sidecars`:
    /// the guard creates that directory, the fallback test asserts it must
    /// NOT exist, and the PATH test reads the resolved value. Run in
    /// parallel these interfere with each other (see debug note plan
    /// 036). Poison-tolerant so one panicking test doesn't lock the others
    /// out.
    static SIDECARS_DIR_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn stderr_tail_keeps_the_last_five_hundred_characters() {
        let stderr = format!("{}TAIL", "x".repeat(600));
        let tail = stderr_tail(stderr.as_bytes());

        assert_eq!(tail.chars().count(), 500);
        assert!(tail.ends_with("TAIL"));
        assert_eq!(tail, format!("{}TAIL", "x".repeat(496)));
    }

    /// RAII guard: creates `<current_exe dir>/sidecars` for the duration of
    /// the test (simulating the installed/bundled layout where
    /// `bundle.resources` lands the DLLs next to the exe), removes it on
    /// drop even on panic. Callers must hold `SIDECARS_DIR_TEST_LOCK` first.
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

    /// RAII guard: clears `PDF_EDITOR_INSTALL_DIR` for the duration of a test
    /// and restores it on drop.
    ///
    /// Plan 067 W8: that variable is the FIRST branch of `sidecar_dll_dir`, so
    /// the two tests below, which assert the second and third branches, only
    /// held while nothing in the environment set it. The `sidecar-contract` CI
    /// job now does set it (the installed-layout launch gate needs it), and
    /// both tests failed there until this guard existed. A test of a fallback
    /// chain has to own the whole chain. Callers must hold
    /// `SIDECARS_DIR_TEST_LOCK` first, which also keeps the mutation off other
    /// threads.
    struct NoInstallDirOverrideGuard {
        previous: Option<std::ffi::OsString>,
    }

    impl NoInstallDirOverrideGuard {
        fn apply() -> Self {
            let previous = std::env::var_os("PDF_EDITOR_INSTALL_DIR");
            // SAFETY: the caller holds SIDECARS_DIR_TEST_LOCK, and every test
            // that reads this variable takes the same lock, so no other thread
            // reads the environment while it changes.
            std::env::remove_var("PDF_EDITOR_INSTALL_DIR");
            Self { previous }
        }
    }

    impl Drop for NoInstallDirOverrideGuard {
        fn drop(&mut self) {
            // SAFETY: see above.
            match self.previous.take() {
                Some(value) => std::env::set_var("PDF_EDITOR_INSTALL_DIR", value),
                None => std::env::remove_var("PDF_EDITOR_INSTALL_DIR"),
            }
        }
    }

    #[test]
    fn sidecar_dll_dir_resolves_exe_relative_when_present() {
        let _lock = SIDECARS_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let _no_override = NoInstallDirOverrideGuard::apply();
        let guard = ExeRelativeSidecarsDirGuard::create();
        let resolved = SidecarManager::sidecar_dll_dir();
        assert_eq!(
            resolved, guard.path,
            "exe-relative sidecars dir must win when it exists"
        );
    }

    /// The counterpart of the two tests above: when the override IS set it must
    /// win over both later branches, which is the whole reason the launch gate
    /// can point at an installed layout.
    #[test]
    fn sidecar_dll_dir_prefers_the_install_dir_override() {
        let _lock = SIDECARS_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let _no_override = NoInstallDirOverrideGuard::apply();
        // SAFETY: the caller holds SIDECARS_DIR_TEST_LOCK; the guard above
        // restores whatever the environment had.
        std::env::set_var("PDF_EDITOR_INSTALL_DIR", "C:\\nowhere\\PDF Editor");
        let resolved = SidecarManager::sidecar_dll_dir();
        assert_eq!(
            resolved,
            PathBuf::from("C:\\nowhere\\PDF Editor").join("sidecars")
        );
    }

    #[test]
    fn sidecar_dll_dir_falls_back_to_manifest_dir_when_absent() {
        let _lock = SIDECARS_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let _no_override = NoInstallDirOverrideGuard::apply();
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
        let _lock = SIDECARS_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
