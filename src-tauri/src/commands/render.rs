// Phase 10 Task 58: render_page_thumbnail.
//
// The Rust `mupdf` crate is deferred, so rendering goes through the
// MupdfWrapper sidecar (mutool draw). Output is cached under
// `%AppData%/PdfEditor/thumbnails/` keyed on sha256(path + page + dpi)
// so repeat scrolling in the thumbnail strip is essentially free.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::util::paths::app_data_dir;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn render_page_thumbnail(
    state: State<'_, AppState>,
    path: String,
    page_index: u32,
    dpi: u32,
) -> AppResult<String> {
    let cache_dir = app_data_dir()
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .join("thumbnails");
    std::fs::create_dir_all(&cache_dir).map_err(AppError::from)?;

    let key = cache_key(&path, page_index, dpi);
    let out = cache_dir.join(format!("{key}.png"));

    if out.exists() {
        return Ok(out.display().to_string());
    }

    let input = PathBuf::from(&path);
    state
        .mupdf
        .render_page_to_png(&input, page_index, &out, dpi, None)
        .await?;
    Ok(out.display().to_string())
}

fn cache_key(path: &str, page_index: u32, dpi: u32) -> String {
    let mut h = Sha256::new();
    h.update(path.as_bytes());
    h.update(b"|");
    h.update(page_index.to_le_bytes());
    h.update(b"|");
    h.update(dpi.to_le_bytes());
    let digest = h.finalize();
    digest.iter().take(12).map(|b| format!("{b:02x}")).collect()
}
