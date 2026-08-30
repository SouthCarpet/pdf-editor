use anyhow::{anyhow, Result};
use std::path::Path;

use crate::error::AppResult;
use crate::sidecars::manager::SidecarManager;
use crate::sidecars::mupdf::MupdfWrapper;

/// Extract UTF-8 text through the same MuPDF sidecar used by runtime
/// commands. This async entry point is available while the legacy sync API
/// below remains a compatibility stub.
pub async fn extract_text_with_mupdf(
    pdf_path: &Path,
    manager: SidecarManager,
) -> AppResult<String> {
    MupdfWrapper::new(manager).extract_text(pdf_path).await
}

/// Extract concatenated UTF-8 text from a PDF. Sidecar-only on this build —
/// the `mupdf` Rust crate is deferred (see `pdf_renderer` for rationale).
/// At runtime, `MupdfWrapper::extract_text` (Phase 4) shells out to `mutool
/// draw -F text` instead. The signature is preserved so commands can flip
/// to in-process extraction later without API churn.
pub fn extract_text(_pdf_path: &Path) -> Result<String> {
    Err(anyhow!(
        "TextExtractor is sidecar-only on this build; use MupdfWrapper::extract_text at runtime"
    ))
}

/// Extract text per page as a `Vec<String>`. Sidecar-only on this build —
/// see `extract_text`.
pub fn extract_text_per_page(_pdf_path: &Path) -> Result<Vec<String>> {
    Err(anyhow!(
        "TextExtractor is sidecar-only on this build; use MupdfWrapper at runtime"
    ))
}
