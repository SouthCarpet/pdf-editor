// Phase 11 Task 65 — Compare tool commands.
//
// Phase-11 architectural note (Delta Q): the original `diff_engine` service
// embedded the rendering call (which goes through the deferred
// `pdf_renderer::render_page_to_png` stub). After Phase 11 we split that
// step out: this command orchestrates rendering via the mupdf sidecar
// directly, then hands the rendered PNGs to `pixel_diff` in the diff
// engine. Once an in-process renderer ships, `visual_diff_pdfs` can be
// reverted to single-call usage without affecting this command.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::diff_engine::{
    pixel_diff, text_diff_pdfs, DiffOptions, TextDiffResult, VisualDiffPage, VisualDiffResult,
};
use crate::services::pdf_reader::{LopdfReader, PdfReader};
use image::RgbaImage;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct CompareArgs {
    pub left: String,
    pub right: String,
    pub job_id: String,
    pub dpi: u32,
    pub tolerance: f32,
}

#[tauri::command]
#[specta::specta]
pub async fn compare_visual_cmd(
    state: State<'_, AppState>,
    args: CompareArgs,
) -> AppResult<VisualDiffResult> {
    let _token = state.cancellation.register(&args.job_id);
    let left = PathBuf::from(&args.left);
    let right = PathBuf::from(&args.right);
    let out_dir = std::env::temp_dir().join(format!("pdf-editor-diff-{}", args.job_id));
    std::fs::create_dir_all(&out_dir).map_err(AppError::from)?;

    // Resolve page counts on a blocking thread (lopdf is sync).
    let left_for_count = left.clone();
    let right_for_count = right.clone();
    let (l_pages, r_pages) = tokio::task::spawn_blocking(move || -> AppResult<(usize, usize)> {
        let l = LopdfReader::open(&left_for_count).map_err(|e| AppError::PdfCorrupted {
            detail: e.to_string(),
        })?;
        let r = LopdfReader::open(&right_for_count).map_err(|e| AppError::PdfCorrupted {
            detail: e.to_string(),
        })?;
        Ok((l.page_count(), r.page_count()))
    })
    .await
    .map_err(|e| AppError::Internal { detail: e.to_string() })??;

    let pages = l_pages.max(r_pages);
    let opts = DiffOptions {
        dpi: args.dpi,
        tolerance: args.tolerance,
    };

    let mut results = Vec::with_capacity(pages);
    for i in 0..pages {
        let l_png = out_dir.join(format!("l_{i}.png"));
        let r_png = out_dir.join(format!("r_{i}.png"));

        // Render each side via the mupdf sidecar. Skip pages that don't
        // exist on a particular side — the PNG simply won't be produced
        // and the diff will be all-changed for that span.
        if (i as usize) < l_pages {
            state
                .mupdf
                .render_page_to_png(&left, i as u32, &l_png, opts.dpi, None)
                .await?;
        }
        if (i as usize) < r_pages {
            state
                .mupdf
                .render_page_to_png(&right, i as u32, &r_png, opts.dpi, None)
                .await?;
        }

        let l_path = l_png.clone();
        let r_path = r_png.clone();
        let diff_path = out_dir.join(format!("diff_{i}.png"));
        let diff_path_for_thread = diff_path.clone();
        let tolerance = opts.tolerance;
        let ratio = tokio::task::spawn_blocking(move || -> AppResult<f32> {
            let l_img = image::open(&l_path).ok().map(|x| x.to_rgba8());
            let r_img = image::open(&r_path).ok().map(|x| x.to_rgba8());
            let (diff_img, ratio) = match (l_img, r_img) {
                (Some(a), Some(b)) => pixel_diff(&a, &b, tolerance),
                _ => (RgbaImage::new(10, 10), 1.0),
            };
            diff_img.save(&diff_path_for_thread).map_err(|e| AppError::Internal {
                detail: format!("save diff: {e}"),
            })?;
            Ok(ratio)
        })
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })??;

        results.push(VisualDiffPage {
            page_index: i,
            diff_image: diff_path.display().to_string(),
            changed_pixel_ratio: ratio,
        });
    }

    state.cancellation.forget(&args.job_id);
    Ok(VisualDiffResult { pages: results })
}

#[tauri::command]
#[specta::specta]
pub async fn compare_text_cmd(
    state: State<'_, AppState>,
    args: CompareArgs,
) -> AppResult<TextDiffResult> {
    let _token = state.cancellation.register(&args.job_id);
    let left = PathBuf::from(&args.left);
    let right = PathBuf::from(&args.right);
    let result = tokio::task::spawn_blocking(move || text_diff_pdfs(&left, &right))
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
    state.cancellation.forget(&args.job_id);
    Ok(result)
}
