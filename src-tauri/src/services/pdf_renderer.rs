use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy)]
pub struct RenderOptions {
    pub dpi: u32,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self { dpi: 150 }
    }
}

/// Render a single page to PNG. Currently sidecar-only on this build —
/// the in-process `mupdf` Rust crate is deferred (mupdf-sys 0.4.4 generates
/// a VS2019 (v142) solution that is not available alongside our v143 build
/// tools). At runtime, `MupdfWrapper::render_page_png` (Phase 4) drives the
/// `mutool` sidecar instead. Returning `Err` here keeps the public service
/// signature stable so commands can flip to in-process rendering later
/// without an API churn.
pub fn render_page_to_png(
    _pdf_path: &Path,
    _page_index: i32,
    _out: &Path,
    _opts: &RenderOptions,
) -> Result<()> {
    Err(anyhow!(
        "PdfRenderer is sidecar-only on this build; use MupdfWrapper::render_page_png at runtime"
    ))
}

/// Render a single page to JPEG. Sidecar-only on this build — see
/// `render_page_to_png` for why; at runtime call `MupdfWrapper` instead.
pub fn render_page_to_jpeg(
    _pdf_path: &Path,
    _page_index: i32,
    _out: &Path,
    _opts: &RenderOptions,
) -> Result<()> {
    Err(anyhow!(
        "PdfRenderer is sidecar-only on this build; use MupdfWrapper at runtime"
    ))
}

/// Render every page to JPEG into `out_dir`. Sidecar-only on this build —
/// see `render_page_to_png`.
pub fn render_pages_to_jpegs(
    _pdf_path: &Path,
    _out_dir: &Path,
    _opts: &RenderOptions,
) -> Result<Vec<PathBuf>> {
    Err(anyhow!(
        "PdfRenderer is sidecar-only on this build; use MupdfWrapper at runtime"
    ))
}

/// Render to multi-page TIFF via the `mutool` sidecar binary directly. This
/// path was already CLI-based in the plan (no `mupdf` crate involvement) so
/// it remains functional even with the crate deferred.
pub fn render_page_to_tiff_multi(
    pdf_path: &Path,
    out: &Path,
    opts: &RenderOptions,
) -> Result<()> {
    use std::process::Command;
    let mutool = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|p| p.join("mutool.exe")))
        .unwrap_or_else(|| PathBuf::from("mutool.exe"));
    let status = Command::new(&mutool)
        .args([
            "convert",
            "-F",
            "tiff",
            "-O",
            &format!("resolution={}", opts.dpi),
            "-o",
            out.to_str()
                .ok_or_else(|| anyhow!("non-utf8 output path"))?,
            pdf_path
                .to_str()
                .ok_or_else(|| anyhow!("non-utf8 input path"))?,
        ])
        .status()?;
    if !status.success() {
        anyhow::bail!("mutool convert tiff failed");
    }
    Ok(())
}
