// Phase 11 Task 62 — Crop tool services.
//
// The original plan called `pdf_renderer::render_page_to_png` inline, but
// that path is the deferred Rust mupdf stub. Instead, the command handler
// renders the page via `state.mupdf.render_page_to_png` (sidecar) first
// and then we operate on the already-decoded image here, so the
// rendering and bbox computation can be split cleanly across async
// (Tokio task) and sync (spawn_blocking) boundaries.
use anyhow::{Context, Result};
use std::path::Path;

/// Auto-detect the bounding box of darkest content in a rendered page.
///
/// `image_path` is the PNG that the caller has already produced via
/// MupdfWrapper. `dpi` is the DPI used when rendering — needed to convert
/// pixel coordinates back to PDF user-space (72-pt) units. `threshold` is
/// the luminance cutoff (0..=255); pixels darker than this are considered
/// "content". Returns `(x, y, w, h)` in PDF points.
pub fn auto_detect_bbox_from_image(
    image_path: &Path,
    dpi: u32,
    threshold: u8,
) -> Result<(f32, f32, f32, f32)> {
    let img = image::open(image_path).context("decode rendered page png")?;
    let gray = img.to_luma8();
    let (w, h) = gray.dimensions();

    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    let mut any = false;
    for y in 0..h {
        for x in 0..w {
            if gray.get_pixel(x, y).0[0] < threshold {
                if x < min_x {
                    min_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if x > max_x {
                    max_x = x;
                }
                if y > max_y {
                    max_y = y;
                }
                any = true;
            }
        }
    }
    if !any {
        // No content — return full page bbox in points.
        let scale_full = 72.0 / dpi.max(1) as f32;
        return Ok((0.0, 0.0, w as f32 * scale_full, h as f32 * scale_full));
    }
    let scale = 72.0 / dpi.max(1) as f32;
    Ok((
        min_x as f32 * scale,
        min_y as f32 * scale,
        (max_x - min_x) as f32 * scale,
        (max_y - min_y) as f32 * scale,
    ))
}
