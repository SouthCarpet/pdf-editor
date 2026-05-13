use std::path::Path;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::sidecars::manager::{SidecarManager, SidecarRunSpec};

pub struct MupdfWrapper {
    mgr: SidecarManager,
}

impl MupdfWrapper {
    pub fn new(mgr: SidecarManager) -> Self {
        Self { mgr }
    }

    pub async fn clean_subset_fonts(
        &self,
        input: &Path,
        output: &Path,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "clean".into(),
            "-gggg".into(),
            "-S".into(),
            input.display().to_string(),
            output.display().to_string(),
        ];
        self.run(args, cancel, Duration::from_secs(60)).await
    }

    /// Convert a PDF to a raster format (`png`, `jpeg`, `tiff`, `pnm`, ...)
    /// via `mutool convert -F <fmt> -O resolution=<dpi>`. Output paths are
    /// what `mutool` writes — for multi-page rasters this is typically
    /// `<stem>1.png`, `<stem>2.png` ... when `-o` is a template with
    /// `%d`; pass the exact pattern in `out_pattern`.
    ///
    /// Phase 9 Task 55 — Convert Export tool routes PNG/JPG/TIFF through
    /// this helper. Single-file TIFF (multi-page) is one call; PNG/JPG
    /// per-page produces one file per PDF page.
    pub async fn convert_to_format(
        &self,
        input: &Path,
        out_pattern: &Path,
        format: &str,
        dpi: u32,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "convert".into(),
            "-F".into(),
            format.into(),
            "-O".into(),
            format!("resolution={dpi}"),
            "-o".into(),
            out_pattern.display().to_string(),
            input.display().to_string(),
        ];
        self.run(args, cancel, Duration::from_secs(180)).await
    }

    pub async fn extract_text(&self, input: &Path) -> AppResult<String> {
        let args = vec![
            "convert".into(),
            "-F".into(),
            "text".into(),
            "-O".into(),
            "preserve-images=no".into(),
            "-o".into(),
            "-".into(),
            input.display().to_string(),
        ];
        let spec = SidecarRunSpec {
            name: "mutool".into(),
            args,
            stdin: None,
            timeout: Some(Duration::from_secs(60)),
            cancellation: None,
        };
        let out = self.mgr.run(spec).await?;
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }

    async fn run(
        &self,
        args: Vec<String>,
        cancel: Option<CancellationToken>,
        timeout: Duration,
    ) -> AppResult<()> {
        let spec = SidecarRunSpec {
            name: "mutool".into(),
            args,
            stdin: None,
            timeout: Some(timeout),
            cancellation: cancel,
        };
        self.mgr.run(spec).await.map(|_| ())
    }
}
