use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::services::ocr_engine::{
    parse_hocr_word, OcrBackend, OcrBackendCapabilities, OcrBackendFuture, OcrRecognitionOptions,
};
use crate::sidecars::manager::{SidecarManager, SidecarRunSpec};

/// Rayon may schedule up to `num_cpus - 1` page jobs, but Tesseract processes
/// are memory-heavy. Two children keep page OCR concurrent without allowing a
/// large document to multiply process memory by the host core count.
pub const MAX_CONCURRENT_TESSERACT_PROCESSES: usize = 2;

pub struct TesseractWrapper {
    mgr: SidecarManager,
    process_limit: Arc<Semaphore>,
}

impl TesseractWrapper {
    pub fn new(mgr: SidecarManager) -> Self {
        Self {
            mgr,
            process_limit: Arc::new(Semaphore::new(MAX_CONCURRENT_TESSERACT_PROCESSES)),
        }
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
        let _permit = self
            .process_limit
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| crate::error::AppError::Internal {
                detail: e.to_string(),
            })?;
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
        self.ocr_image_with_hocr_options(image, lang, 3, 3, cancel)
            .await
    }

    pub async fn ocr_image_with_hocr_options(
        &self,
        image: &Path,
        lang: &str,
        psm: u8,
        oem: u8,
        cancel: Option<CancellationToken>,
    ) -> AppResult<String> {
        let _permit = self
            .process_limit
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| crate::error::AppError::Internal {
                detail: e.to_string(),
            })?;
        let tessdata = Self::tessdata_dir();
        let spec = SidecarRunSpec {
            name: "tesseract".into(),
            args: vec![
                image.display().to_string(),
                "stdout".into(),
                "-l".into(),
                lang.into(),
                "--psm".into(),
                psm.to_string(),
                "--oem".into(),
                oem.to_string(),
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

impl OcrBackend for TesseractWrapper {
    fn capabilities(&self) -> OcrBackendCapabilities {
        OcrBackendCapabilities {
            id: "tesseract",
            display_name: "Tesseract",
            supported_languages: &["eng", "slk", "ces", "deu", "pol"],
            supports_multi_language: true,
            provides_word_confidence: true,
        }
    }

    fn recognize<'a>(
        &'a self,
        image: &'a Path,
        lang: &'a str,
        opts: &'a OcrRecognitionOptions,
    ) -> OcrBackendFuture<'a> {
        Box::pin(async move {
            let hocr = self
                .ocr_image_with_hocr_options(
                    image,
                    lang,
                    opts.psm,
                    opts.oem,
                    opts.cancellation.clone(),
                )
                .await?;
            Ok(parse_hocr_word(&hocr))
        })
    }
}
