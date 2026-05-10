use anyhow::Result;
use image::{ImageBuffer, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};
use std::path::{Path, PathBuf};

use crate::services::pdf_reader::{LopdfReader, PdfReader};
use crate::services::pdf_renderer::{render_page_to_png, RenderOptions};
use crate::services::text_extractor::extract_text_per_page;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffOptions {
    pub dpi: u32,
    pub tolerance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualDiffResult {
    pub pages: Vec<VisualDiffPage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualDiffPage {
    pub page_index: usize,
    pub diff_image: PathBuf,
    pub changed_pixel_ratio: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextDiffResult {
    pub changes: Vec<TextDiffChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextDiffChange {
    pub kind: String,
    pub left: Option<String>,
    pub right: Option<String>,
}

pub fn visual_diff_pdfs(
    left: &Path,
    right: &Path,
    out_dir: &Path,
    opts: &DiffOptions,
) -> Result<VisualDiffResult> {
    std::fs::create_dir_all(out_dir).ok();
    let opts_render = RenderOptions { dpi: opts.dpi };

    // Plan used `mupdf::Document::open` for the page-count loop; mupdf is
    // deferred on this build, so use the lopdf reader instead. Either side
    // may have more pages — take the max so we render and diff all of them.
    let doc_l = LopdfReader::open(left)?;
    let doc_r = LopdfReader::open(right)?;
    let pages = doc_l.page_count().max(doc_r.page_count());

    let mut results = Vec::with_capacity(pages);
    for i in 0..pages {
        let l_png = out_dir.join(format!("l_{i}.png"));
        let r_png = out_dir.join(format!("r_{i}.png"));
        // render_page_to_png is sidecar-only on this build; the Err is
        // intentionally swallowed here so the diff at least produces an
        // empty placeholder per page until command handlers wire up
        // MupdfWrapper. Once that wiring lands, this code path will start
        // producing real diffs without further changes.
        let _ = render_page_to_png(left, i as i32, &l_png, &opts_render);
        let _ = render_page_to_png(right, i as i32, &r_png, &opts_render);

        let l_img = image::open(&l_png).ok().map(|x| x.to_rgba8());
        let r_img = image::open(&r_png).ok().map(|x| x.to_rgba8());

        let (diff_img, ratio) = match (l_img, r_img) {
            (Some(a), Some(b)) => pixel_diff(&a, &b, opts.tolerance),
            _ => (RgbaImage::new(10, 10), 1.0),
        };
        let diff_path = out_dir.join(format!("diff_{i}.png"));
        diff_img.save(&diff_path).ok();
        results.push(VisualDiffPage {
            page_index: i,
            diff_image: diff_path,
            changed_pixel_ratio: ratio,
        });
    }
    Ok(VisualDiffResult { pages: results })
}

fn pixel_diff(a: &RgbaImage, b: &RgbaImage, tolerance: f32) -> (RgbaImage, f32) {
    let (w, h) = (a.width().min(b.width()), a.height().min(b.height()));
    let mut out: RgbaImage = ImageBuffer::new(w, h);
    let mut diff_count = 0u64;
    for y in 0..h {
        for x in 0..w {
            let pa = a.get_pixel(x, y);
            let pb = b.get_pixel(x, y);
            let dr = (pa[0] as i32 - pb[0] as i32).unsigned_abs();
            let dg = (pa[1] as i32 - pb[1] as i32).unsigned_abs();
            let db = (pa[2] as i32 - pb[2] as i32).unsigned_abs();
            let max = dr.max(dg).max(db) as f32 / 255.0;
            if max > tolerance {
                out.put_pixel(x, y, Rgba([255, 0, 0, 200]));
                diff_count += 1;
            } else {
                out.put_pixel(x, y, Rgba([pa[0], pa[1], pa[2], 64]));
            }
        }
    }
    let ratio = diff_count as f32 / (w * h).max(1) as f32;
    (out, ratio)
}

pub fn text_diff_pdfs(left: &Path, right: &Path) -> Result<TextDiffResult> {
    let left_pages = extract_text_per_page(left)?.join("\n");
    let right_pages = extract_text_per_page(right)?.join("\n");

    let diff = TextDiff::from_words(&left_pages, &right_pages);
    let mut changes = Vec::new();
    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {}
            ChangeTag::Delete => changes.push(TextDiffChange {
                kind: "delete".into(),
                left: Some(change.value().to_string()),
                right: None,
            }),
            ChangeTag::Insert => changes.push(TextDiffChange {
                kind: "insert".into(),
                left: None,
                right: Some(change.value().to_string()),
            }),
        }
    }
    Ok(TextDiffResult { changes })
}
