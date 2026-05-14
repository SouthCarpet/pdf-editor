// Phase 11 Task 62 — Crop tool command.
//
// Manual rectangle or auto-detect. Auto-detect first renders the target
// page via the mupdf sidecar (`state.mupdf.render_page_to_png`) into a
// scratch tempdir, then scans the PNG for the bounding box of darkest
// content. The detected bbox is applied as `/CropBox` to either the
// single active page or every page in the document (`apply_to_all_pages`).
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::crop::auto_detect_bbox_from_image;
use lopdf::{Document, Object};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use tempfile::tempdir;

const AUTO_DETECT_DPI: u32 = 100;
const DEFAULT_AUTO_DETECT_THRESHOLD: u8 = 240;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct CropArgs {
    pub input: String,
    pub output: String,
    pub page_index: u32,
    pub bbox: Option<[f32; 4]>, // x, y, w, h in PDF points
    pub auto_detect: bool,
    pub apply_to_all_pages: bool,
    pub job_id: String,
    // Delta U Phase 17 Task 86a — extra fields. apply_to overrides
    // apply_to_all_pages when set; auto_detect_threshold replaces the
    // module-private constant when supplied.
    #[serde(default)]
    pub aspect_ratio: Option<String>,
    #[serde(default)]
    pub aspect_ratio_w: Option<f32>,
    #[serde(default)]
    pub aspect_ratio_h: Option<f32>,
    #[serde(default)]
    pub page_size_preset: Option<String>,
    #[serde(default)]
    pub margin_preset: Option<String>,
    #[serde(default)]
    pub margin_custom_mm: Option<f32>,
    #[serde(default)]
    pub apply_to: Option<String>,
    #[serde(default)]
    pub apply_range: Option<String>,
    #[serde(default)]
    pub auto_detect_threshold: Option<u8>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct CropResult {
    pub output_paths: Vec<String>,
    pub bbox_applied: [f32; 4],
}

#[tauri::command]
#[specta::specta]
pub async fn crop_pdf_cmd(state: State<'_, AppState>, args: CropArgs) -> AppResult<CropResult> {
    let _token = state.cancellation.register(&args.job_id);

    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);

    // 1) Resolve bbox: either supplied or auto-detected via mupdf sidecar.
    let threshold: u8 = args.auto_detect_threshold.unwrap_or(DEFAULT_AUTO_DETECT_THRESHOLD);
    let bbox: [f32; 4] = if args.auto_detect {
        // Render the page to a scratch PNG using the sidecar; the tempdir is
        // dropped at the end of this function and the PNG is cleaned up.
        let scratch = tempdir().map_err(AppError::from)?;
        let png = scratch.path().join("p.png");
        state
            .mupdf
            .render_page_to_png(&input, args.page_index, &png, AUTO_DETECT_DPI, None)
            .await?;

        let png_for_scan = png.clone();
        let detected = tokio::task::spawn_blocking(move || {
            auto_detect_bbox_from_image(&png_for_scan, AUTO_DETECT_DPI, threshold)
        })
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
        [detected.0, detected.1, detected.2, detected.3]
    } else {
        args.bbox.ok_or_else(|| AppError::InvalidArgument {
            detail: "bbox required when auto_detect = false".into(),
        })?
    };

    // 2) Apply the CropBox.
    let pages_to_crop = args.apply_to_all_pages;
    let bbox_for_thread = bbox;
    let input_for_thread = input.clone();
    let output_for_thread = output.clone();
    let page_index = args.page_index;
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let mut doc = Document::load(&input_for_thread).map_err(|e| AppError::PdfCorrupted {
            detail: e.to_string(),
        })?;
        let pages = doc.get_pages();
        let target_pages: Vec<u32> = if pages_to_crop {
            pages.keys().copied().collect()
        } else {
            vec![page_index + 1]
        };
        for page_num in target_pages {
            if let Some(&page_id) = pages.get(&page_num) {
                if let Some(obj) = doc.objects.get_mut(&page_id) {
                    if let Ok(d) = obj.as_dict_mut() {
                        let crop_array: Vec<Object> = vec![
                            Object::Real(bbox_for_thread[0]),
                            Object::Real(bbox_for_thread[1]),
                            Object::Real(bbox_for_thread[0] + bbox_for_thread[2]),
                            Object::Real(bbox_for_thread[1] + bbox_for_thread[3]),
                        ];
                        d.set("CropBox", crop_array);
                    }
                }
            }
        }
        doc.compress();
        doc.save(&output_for_thread).map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal { detail: e.to_string() })??;

    state.cancellation.forget(&args.job_id);
    Ok(CropResult {
        output_paths: vec![args.output],
        bbox_applied: bbox,
    })
}
