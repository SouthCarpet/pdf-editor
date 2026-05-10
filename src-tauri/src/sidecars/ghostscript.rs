use std::path::Path;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::sidecars::manager::{SidecarManager, SidecarRunSpec};

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressionPreset {
    Recommended,
    High,
    Maximum,
}

impl CompressionPreset {
    fn pdf_settings(&self) -> &'static str {
        match self {
            Self::Recommended => "/ebook",
            Self::High => "/screen",
            Self::Maximum => "/screen",
        }
    }
    fn jpeg_quality(&self) -> u8 {
        match self {
            Self::Recommended => 85,
            Self::High => 60,
            Self::Maximum => 40,
        }
    }
    fn dpi(&self) -> u16 {
        match self {
            Self::Recommended => 150,
            Self::High => 96,
            Self::Maximum => 72,
        }
    }
}

pub struct GhostscriptWrapper {
    mgr: SidecarManager,
}

impl GhostscriptWrapper {
    pub fn new(mgr: SidecarManager) -> Self {
        Self { mgr }
    }

    pub async fn compress(
        &self,
        input: &Path,
        output: &Path,
        preset: CompressionPreset,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "-sDEVICE=pdfwrite".into(),
            "-dCompatibilityLevel=1.7".into(),
            format!("-dPDFSETTINGS={}", preset.pdf_settings()),
            "-dNOPAUSE".into(),
            "-dQUIET".into(),
            "-dBATCH".into(),
            "-dColorImageDownsampleType=/Bicubic".into(),
            format!("-dColorImageResolution={}", preset.dpi()),
            "-dGrayImageDownsampleType=/Bicubic".into(),
            format!("-dGrayImageResolution={}", preset.dpi()),
            "-dAutoFilterColorImages=true".into(),
            format!("-dJPEGQ={}", preset.jpeg_quality()),
            format!("-sOutputFile={}", output.display()),
            input.display().to_string(),
        ];
        self.run(args, cancel, Duration::from_secs(120)).await
    }

    pub async fn convert_to_pdfa(
        &self,
        input: &Path,
        output: &Path,
        version: u8,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "-dPDFA=2".into(),
            format!("-dPDFACompatibilityPolicy={}", version),
            "-sProcessColorModel=DeviceRGB".into(),
            "-sDEVICE=pdfwrite".into(),
            "-dNOPAUSE".into(),
            "-dQUIET".into(),
            "-dBATCH".into(),
            format!("-sOutputFile={}", output.display()),
            input.display().to_string(),
        ];
        self.run(args, cancel, Duration::from_secs(120)).await
    }

    async fn run(
        &self,
        args: Vec<String>,
        cancel: Option<CancellationToken>,
        timeout: Duration,
    ) -> AppResult<()> {
        let spec = SidecarRunSpec {
            name: "gswin64c".into(),
            args,
            stdin: None,
            timeout: Some(timeout),
            cancellation: cancel,
        };
        self.mgr.run(spec).await.map(|_| ())
    }
}
