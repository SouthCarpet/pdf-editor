use anyhow::{Context, Result};
use std::path::PathBuf;
use tokio::process::Command;

fn resolve_sidecar(name: &str) -> PathBuf {
    let exe = std::env::current_exe().expect("current_exe");
    let mut dir = exe.parent().expect("parent").to_path_buf();
    dir.push(format!("{name}.exe"));
    if dir.exists() {
        return dir;
    }
    let workspace = std::env::var("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    workspace.join(format!("sidecars/{name}-x86_64-pc-windows-msvc.exe"))
}

pub async fn run_qpdf_version() -> Result<String> {
    let bin = resolve_sidecar("qpdf");
    let out = Command::new(&bin)
        .arg("--version")
        .output()
        .await
        .with_context(|| format!("spawning {}", bin.display()))?;
    if !out.status.success() {
        anyhow::bail!(
            "qpdf exit {:?}: {}",
            out.status.code(),
            String::from_utf8_lossy(&out.stderr)
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}
