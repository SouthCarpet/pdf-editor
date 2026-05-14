// Phase 13 Task 70 — OCR command + scanned-PDF detection.
//
// Pipeline:
//   1. Render each page to a PNG at the requested DPI via MupdfWrapper.
//   2. Run TesseractWrapper::ocr_image_with_hocr per page.
//   3. Parse the hOCR via services::ocr_engine::parse_hocr_word.
//   4. Build an invisible text overlay and inject as a /Contents stream
//      on the corresponding page.
//   5. (Optional) Also write a plain `.txt` sidecar per `OcrOutputMode`.
//
// Scan detection: extract text via MupdfWrapper::extract_text, count
// characters per page, flag the doc as "likely scanned" if the average
// is below 50 chars/page.

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::ocr_engine::{
    build_text_layer_from_hocr, OcrOptions, OcrOutputMode,
};
use lopdf::{dictionary, Document, Object, Stream};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;
use tempfile::TempDir;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct OcrArgs {
    pub input: String,
    pub output: String,
    pub options: OcrOptions,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OcrResult {
    pub output_paths: Vec<String>,
    pub pages_processed: u32,
    pub characters_recognized: usize,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ScanLikelihood {
    pub is_likely_scanned: bool,
    pub avg_chars_per_page: f64,
    pub total_pages: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn ocr_pdf_cmd(state: State<'_, AppState>, args: OcrArgs) -> AppResult<OcrResult> {
    let token = state.cancellation.register(&args.job_id);
    let in_path = PathBuf::from(&args.input);
    let out_path = PathBuf::from(&args.output);
    let opts = args.options.clone();
    let mupdf = state.mupdf.clone();
    let tesseract = state.tesseract.clone();

    let result = ocr_pdf(in_path, out_path.clone(), opts, mupdf, tesseract, token).await;
    state.cancellation.forget(&args.job_id);
    let processed = result?;
    Ok(processed)
}

async fn ocr_pdf(
    input: PathBuf,
    output: PathBuf,
    options: OcrOptions,
    mupdf: std::sync::Arc<crate::sidecars::mupdf::MupdfWrapper>,
    tesseract: std::sync::Arc<crate::sidecars::tesseract::TesseractWrapper>,
    cancel: tokio_util::sync::CancellationToken,
) -> AppResult<OcrResult> {
    // Load doc up-front to enumerate pages + bbox.
    let page_count = {
        let doc = Document::load(&input)
            .map_err(|e| AppError::Internal { detail: format!("load: {e}") })?;
        doc.get_pages().len() as u32
    };

    let tempdir =
        TempDir::new().map_err(|e| AppError::Internal { detail: e.to_string() })?;
    let mut hocr_per_page: Vec<(u32, String, u32, u32)> = Vec::new(); // page_index, hocr, pixel_w, pixel_h
    let mut total_chars = 0usize;

    for page_index in 0..page_count {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let raster_path = tempdir.path().join(format!("page-{page_index}.png"));
        mupdf
            .render_page_to_png(&input, page_index, &raster_path, options.dpi, Some(cancel.clone()))
            .await?;
        // Read raster dimensions to map bbox correctly.
        let (pixel_w, pixel_h) = read_png_dimensions(&raster_path).unwrap_or((1, 1));
        let hocr = tesseract
            .ocr_image_with_hocr(&raster_path, &options.language, Some(cancel.clone()))
            .await?;
        total_chars += hocr.matches("ocrx_word").count();
        hocr_per_page.push((page_index, hocr, pixel_w, pixel_h));
    }

    // Extract plain text up-front so we can hand `hocr_per_page` to the
    // blocking closure without contending with the immutable borrow.
    let plain_text =
        tesseract_text_from_hocrs(&hocr_per_page_text(&hocr_per_page));

    // Inject overlays unless TextOnly mode.
    if !matches!(options.output, OcrOutputMode::TextOnly) {
        let in_clone = input.clone();
        let out_clone = output.clone();
        let opts_clone = options.clone();
        let hocr_clone = hocr_per_page;
        tokio::task::spawn_blocking(move || {
            inject_text_layers(&in_clone, &out_clone, &opts_clone, &hocr_clone)
        })
        .await
        .map_err(|e| AppError::Internal { detail: e.to_string() })?
        .map_err(|e| AppError::Internal { detail: format!("{e:#}") })?;
    }

    // Sidecar .txt path for PdfPlusText / TextOnly.
    let mut output_paths = vec![output.display().to_string()];
    if matches!(options.output, OcrOutputMode::PdfPlusText | OcrOutputMode::TextOnly) {
        let txt_path = output.with_extension("txt");
        std::fs::write(&txt_path, plain_text)?;
        output_paths.push(txt_path.display().to_string());
    }

    Ok(OcrResult {
        output_paths,
        pages_processed: page_count,
        characters_recognized: total_chars,
    })
}

fn hocr_per_page_text(entries: &[(u32, String, u32, u32)]) -> Vec<String> {
    entries.iter().map(|(_, h, _, _)| h.clone()).collect()
}

fn tesseract_text_from_hocrs(hocrs: &[String]) -> String {
    use crate::services::ocr_engine::parse_hocr_word;
    let mut out = String::new();
    for h in hocrs {
        let words = parse_hocr_word(h);
        let joined: Vec<String> = words.into_iter().map(|w| w.text).collect();
        out.push_str(&joined.join(" "));
        out.push('\n');
    }
    out
}

fn read_png_dimensions(path: &Path) -> Option<(u32, u32)> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = [0u8; 24];
    f.read_exact(&mut buf).ok()?;
    // PNG: bytes 16..20 = width, 20..24 = height (big-endian).
    let w = u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]);
    let h = u32::from_be_bytes([buf[20], buf[21], buf[22], buf[23]]);
    Some((w, h))
}

/// Open the PDF, append a /Contents reference per page that points to
/// the invisible text overlay, then save to `output`. Helvetica is
/// registered as /F1 in each touched page's /Resources /Font dict.
fn inject_text_layers(
    input: &Path,
    output: &Path,
    _opts: &OcrOptions,
    hocrs: &[(u32, String, u32, u32)],
) -> anyhow::Result<()> {
    let mut doc = Document::load(input)?;
    let pages_map = doc.get_pages();

    let helv_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });

    for (page_index, hocr, pixel_w, pixel_h) in hocrs {
        let Some(&page_id) = pages_map.get(&(page_index + 1)) else {
            continue;
        };
        let (page_w, page_h) = match page_dimensions(&doc, page_id) {
            Some(d) => d,
            None => (612.0, 792.0),
        };
        let stream_bytes =
            build_text_layer_from_hocr(hocr, *pixel_w, *pixel_h, page_w, page_h);
        let stream_id = doc.add_object(Object::Stream(Stream::new(dictionary! {}, stream_bytes)));
        if let Some(obj) = doc.objects.get_mut(&page_id) {
            if let Ok(d) = obj.as_dict_mut() {
                let mut contents: Vec<Object> = match d.get(b"Contents").cloned() {
                    Ok(Object::Reference(r)) => vec![Object::Reference(r)],
                    Ok(Object::Array(a)) => a,
                    _ => Vec::new(),
                };
                contents.push(Object::Reference(stream_id));
                d.set("Contents", contents);
                ensure_helv_font(d, helv_id);
            }
        }
    }
    doc.compress();
    doc.save(output)?;
    Ok(())
}

fn page_dimensions(doc: &Document, page_id: lopdf::ObjectId) -> Option<(f32, f32)> {
    let page = doc.get_object(page_id).ok()?.as_dict().ok()?;
    let mbox = page.get(b"MediaBox").ok()?.as_array().ok()?;
    if mbox.len() != 4 {
        return None;
    }
    let get = |i: usize| -> f32 {
        match &mbox[i] {
            Object::Integer(n) => *n as f32,
            Object::Real(f) => *f,
            _ => 0.0,
        }
    };
    Some((get(2) - get(0), get(3) - get(1)))
}

fn ensure_helv_font(page: &mut lopdf::Dictionary, helv_id: lopdf::ObjectId) {
    let res = match page.get_mut(b"Resources") {
        Ok(Object::Dictionary(r)) => r,
        _ => {
            page.set("Resources", Object::Dictionary(lopdf::Dictionary::new()));
            match page.get_mut(b"Resources") {
                Ok(Object::Dictionary(r)) => r,
                _ => return,
            }
        }
    };
    let fonts = match res.get_mut(b"Font") {
        Ok(Object::Dictionary(f)) => f,
        _ => {
            res.set("Font", Object::Dictionary(lopdf::Dictionary::new()));
            match res.get_mut(b"Font") {
                Ok(Object::Dictionary(f)) => f,
                _ => return,
            }
        }
    };
    if fonts.get(b"F1").is_err() {
        fonts.set("F1", Object::Reference(helv_id));
    }
}

#[tauri::command]
#[specta::specta]
pub async fn detect_scanned_pdf(state: State<'_, AppState>, path: String) -> AppResult<ScanLikelihood> {
    let p = PathBuf::from(&path);
    let mupdf = state.mupdf.clone();
    // Extract all text from the document (mutool draw -F text); split on
    // form-feed (mutool uses \f as page separator).
    let text = mupdf.extract_text(&p).await?;
    let pages: Vec<&str> = text.split('\x0C').collect();
    let total: usize = pages.iter().map(|s| s.trim().chars().count()).sum();
    let total_pages = pages.len() as u32;
    let avg = if total_pages == 0 {
        0.0
    } else {
        total as f64 / total_pages as f64
    };
    Ok(ScanLikelihood {
        is_likely_scanned: avg < 50.0,
        avg_chars_per_page: avg,
        total_pages,
    })
}
