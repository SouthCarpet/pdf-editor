// Phase 9 Task 55 — Convert Export tool. Tier A (PDF → raster + text) is
// handled by MupdfWrapper (mutool sidecar — the in-process mupdf crate is
// deferred). Tier B (PDF → office formats) and PDF/A go through the
// LibreOffice sidecar; PDF/A follows Delta E (LO primary, GS fallback).
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use tracing::warn;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Png,
    Jpg,
    Tiff,
    Txt,
    Html,
    Docx,
    Odt,
    Rtf,
    Epub,
    PdfA,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ExportArgs {
    pub input: String,
    pub format: ExportFormat,
    pub out_dir: String,
    pub job_id: String,
    // Delta U Phase 17 Task 86a — per-format sub-options. All optional;
    // mutool / soffice currently use their built-in defaults, so these
    // survive over the FFI while a follow-up wires them through.
    #[serde(default)]
    pub raster_dpi: Option<u32>,
    #[serde(default)]
    pub raster_color_mode: Option<String>,
    #[serde(default)]
    pub jpeg_quality: Option<u8>,
    #[serde(default)]
    pub tiff_compression: Option<String>,
    #[serde(default)]
    pub page_range: Option<String>,
    #[serde(default)]
    pub txt_encoding: Option<String>,
    #[serde(default)]
    pub txt_layout: Option<String>,
    #[serde(default)]
    pub txt_page_separator: Option<String>,
    #[serde(default)]
    pub html_single_file: Option<bool>,
    #[serde(default)]
    pub html_embed_images_base64: Option<bool>,
    #[serde(default)]
    pub office_preserve_formatting: Option<bool>,
    #[serde(default)]
    pub office_embed_images: Option<bool>,
    #[serde(default)]
    pub office_page_break: Option<String>,
    #[serde(default)]
    pub pdfa_version: Option<u8>,
    #[serde(default)]
    pub pdfa_engine: Option<String>,
    #[serde(default)]
    pub pdfa_embed_all_fonts: Option<bool>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ExportResult {
    pub output_paths: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn convert_pdf_export_cmd(
    state: State<'_, AppState>,
    args: ExportArgs,
) -> AppResult<ExportResult> {
    let input = PathBuf::from(&args.input);
    let out_dir = PathBuf::from(&args.out_dir);
    std::fs::create_dir_all(&out_dir).map_err(|e| AppError::IoError {
        detail: e.to_string(),
    })?;
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("out")
        .to_string();

    let token = state.cancellation.register(&args.job_id);

    let result: AppResult<ExportResult> = match args.format {
        ExportFormat::Png | ExportFormat::Jpg | ExportFormat::Tiff => {
            let output =
                export_raster(&state, &input, &out_dir, &stem, args.format, &token).await?;
            Ok(output)
        }
        ExportFormat::Txt => {
            let out = out_dir.join(format!("{stem}.txt"));
            let text = state.mupdf.extract_text(&input).await?;
            tokio::fs::write(&out, text)
                .await
                .map_err(|e| AppError::IoError {
                    detail: e.to_string(),
                })?;
            Ok(ExportResult {
                output_paths: vec![out.display().to_string()],
            })
        }
        ExportFormat::Html => {
            // mutool convert -F html — single-file HTML output.
            let out = out_dir.join(format!("{stem}.html"));
            state
                .mupdf
                .convert_to_format(&input, &out, "html", 150, Some(token.clone()))
                .await?;
            Ok(ExportResult {
                output_paths: vec![out.display().to_string()],
            })
        }
        ExportFormat::Docx | ExportFormat::Odt | ExportFormat::Rtf | ExportFormat::Epub => {
            let target = match args.format {
                ExportFormat::Docx => "docx",
                ExportFormat::Odt => "odt",
                ExportFormat::Rtf => "rtf",
                ExportFormat::Epub => "epub",
                _ => unreachable!(),
            };
            let out = state
                .soffice
                .convert(&input, &out_dir, target, Some(token.clone()))
                .await?;
            Ok(ExportResult {
                output_paths: vec![out.display().to_string()],
            })
        }
        ExportFormat::PdfA => {
            let output = export_pdfa(&state, &input, &out_dir, &stem, &token).await?;
            Ok(output)
        }
    };

    state.cancellation.forget(&args.job_id);
    result
}

async fn export_raster(
    state: &AppState,
    input: &std::path::Path,
    out_dir: &std::path::Path,
    stem: &str,
    format: ExportFormat,
    token: &tokio_util::sync::CancellationToken,
) -> AppResult<ExportResult> {
    let (fmt, ext, multi_page_single_file) = match format {
        ExportFormat::Png => ("png", "png", false),
        ExportFormat::Jpg => ("jpeg", "jpg", false),
        ExportFormat::Tiff => ("tiff", "tiff", true),
        _ => unreachable!(),
    };
    // mutool's `-o` accepts a `%d` template for multi-file outputs.
    // For PNG/JPG we produce one file per page; for TIFF we write a
    // single multi-page TIFF.
    let pattern = if multi_page_single_file {
        out_dir.join(format!("{stem}.{ext}"))
    } else {
        out_dir.join(format!("{stem}-%d.{ext}"))
    };
    state
        .mupdf
        .convert_to_format(input, &pattern, fmt, 150, Some(token.clone()))
        .await?;
    // We can't enumerate exact output filenames without scanning the
    // directory (mutool numbers pages 1..N). Glob the expected names
    // and report what exists; for TIFF it's just the single file.
    let outs = if multi_page_single_file {
        vec![pattern.display().to_string()]
    } else {
        let mut v = Vec::new();
        for i in 1..=10_000u32 {
            let candidate = out_dir.join(format!("{stem}-{i}.{ext}"));
            if candidate.exists() {
                v.push(candidate.display().to_string());
            } else {
                break;
            }
        }
        v
    };
    Ok(ExportResult { output_paths: outs })
}

async fn export_pdfa(
    state: &AppState,
    input: &std::path::Path,
    out_dir: &std::path::Path,
    stem: &str,
    token: &tokio_util::sync::CancellationToken,
) -> AppResult<ExportResult> {
    // Delta E: LO primary, GS fallback.
    let lo_target =
        "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}";
    let lo_attempt = state
        .soffice
        .convert(input, out_dir, lo_target, Some(token.clone()))
        .await;
    match lo_attempt {
        Ok(out) => Ok(ExportResult {
            output_paths: vec![out.display().to_string()],
        }),
        Err(lo_err) => {
            warn!(
                error = ?lo_err,
                "LibreOffice PDF/A export failed; falling back to Ghostscript"
            );
            let gs_out = out_dir.join(format!("{stem}.pdf"));
            state
                .gs
                .convert_to_pdfa(input, &gs_out, 2, Some(token.clone()))
                .await?;
            Ok(ExportResult {
                output_paths: vec![gs_out.display().to_string()],
            })
        }
    }
}
