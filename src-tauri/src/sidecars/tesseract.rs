use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::sidecars::manager::{SidecarManager, SidecarRunSpec};

pub struct TesseractWrapper {
    mgr: SidecarManager,
}

impl TesseractWrapper {
    pub fn new(mgr: SidecarManager) -> Self {
        Self { mgr }
    }

    fn tessdata_dir() -> PathBuf {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(p) = exe.parent() {
                let r = p.join("resources/tessdata");
                if r.exists() {
                    return r;
                }
            }
        }
        std::env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("resources/tessdata")
    }

    pub async fn ocr_image(
        &self,
        image: &Path,
        lang: &str,
        cancel: Option<CancellationToken>,
    ) -> AppResult<String> {
        let tessdata = Self::tessdata_dir();
        let spec = SidecarRunSpec {
            name: "tesseract".into(),
            args: vec![
                image.display().to_string(),
                "stdout".into(),
                "-l".into(),
                lang.into(),
                "--tessdata-dir".into(),
                tessdata.display().to_string(),
                "-c".into(),
                "preserve_interword_spaces=1".into(),
            ],
            stdin: None,
            timeout: Some(Duration::from_secs(120)),
            cancellation: cancel,
        };
        let out = self.mgr.run(spec).await?;
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }

    pub async fn ocr_image_with_hocr(
        &self,
        image: &Path,
        lang: &str,
        cancel: Option<CancellationToken>,
    ) -> AppResult<String> {
        let tessdata = Self::tessdata_dir();
        let spec = SidecarRunSpec {
            name: "tesseract".into(),
            args: vec![
                image.display().to_string(),
                "stdout".into(),
                "-l".into(),
                lang.into(),
                "--tessdata-dir".into(),
                tessdata.display().to_string(),
                "hocr".into(),
            ],
            stdin: None,
            timeout: Some(Duration::from_secs(120)),
            cancellation: cancel,
        };
        let out = self.mgr.run(spec).await?;
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }
}
