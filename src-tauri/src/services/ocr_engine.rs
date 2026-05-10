use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrOptions {
    pub language: String,
    pub dpi: u32,
}

/// Routing threshold per `engine_ocr_stack` vault spec: <=10 pages should
/// run via the in-process Rust crate, >10 pages via the sidecar binary. On
/// this build both routes use the sidecar because the in-process tesseract
/// Rust crate is deferred (`leptonica-sys` requires a vcpkg-installed
/// leptonica). The constant is still exposed so command handlers do not
/// need to be rewritten when the in-process path is re-enabled.
pub const OCR_SIDECAR_THRESHOLD: usize = 10;

/// Add an invisible OCR text layer to a PDF. Sidecar-only on this build —
/// both `mupdf` (for rasterizing pages) and `tesseract` (for OCR) Rust
/// crates are deferred. Runtime command handlers should call
/// `TesseractWrapper` + `MupdfWrapper` from `crate::sidecars::*` instead of
/// invoking this function until the in-process path is re-enabled.
pub fn ocr_pdf_add_text_layer(
    _input: &Path,
    _output: &Path,
    _opts: &OcrOptions,
) -> Result<()> {
    Err(anyhow!(
        "ocr_pdf_add_text_layer is sidecar-only on this build; use TesseractWrapper + MupdfWrapper at runtime"
    ))
}
