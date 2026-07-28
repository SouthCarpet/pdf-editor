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
use crate::persistence::ocr_cache::{self, CachedOcrPage, OcrCacheKey};
use crate::services::font_embed::FontSubsetter;
use crate::services::fonts;
use crate::services::ocr_engine::{
    average_confidence, build_invisible_text_stream, parse_hocr_word, words_to_hocr,
    words_to_plain_text, OcrBackend, OcrOptions, OcrOutputMode, OcrRecognitionOptions, WordBox,
    LOW_CONFIDENCE_THRESHOLD,
};
use lopdf::{dictionary, Document, Object, Stream};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::State;

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
    pub average_confidence: Option<f32>,
    pub page_confidences: Vec<OcrPageConfidence>,
    pub low_confidence_pages: Vec<u32>,
    pub cache_hits: u32,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OcrPageConfidence {
    pub page_number: u32,
    pub confidence: Option<f32>,
    pub low_confidence: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct RecognizedOcrPage {
    pub page_index: u32,
    pub words: Vec<WordBox>,
    pub pixel_width: u32,
    pub pixel_height: u32,
    pub cache_hit: bool,
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
    let backend: Arc<dyn OcrBackend> = state.tesseract.clone();
    let pool = state.pool.clone();

    let result = ocr_pdf(in_path, out_path.clone(), opts, mupdf, backend, pool, token).await;
    state.cancellation.forget(&args.job_id);
    let processed = result?;
    Ok(processed)
}

async fn ocr_pdf(
    input: PathBuf,
    output: PathBuf,
    options: OcrOptions,
    mupdf: Arc<crate::sidecars::mupdf::MupdfWrapper>,
    backend: Arc<dyn OcrBackend>,
    pool: SqlitePool,
    cancel: tokio_util::sync::CancellationToken,
) -> AppResult<OcrResult> {
    // Load doc up-front to enumerate pages + bbox.
    let page_count = {
        let doc = Document::load(&input).map_err(|e| AppError::Internal {
            detail: format!("load: {e}"),
        })?;
        doc.get_pages().len() as u32
    };

    let engine = backend.capabilities().id.to_string();
    let pages = recognize_pdf_pages(
        &input,
        page_count,
        &options,
        mupdf,
        backend,
        pool,
        cancel.clone(),
    )
    .await?;
    let plain_text = recognized_pages_to_text(&pages);
    let total_chars = pages
        .iter()
        .flat_map(|page| page.words.iter())
        .map(|word| word.text.chars().count())
        .sum();

    // Inject overlays unless TextOnly mode.
    if !matches!(options.output, OcrOutputMode::TextOnly) {
        let in_clone = input.clone();
        let out_clone = output.clone();
        let opts_clone = options.clone();
        let pages_clone = pages.clone();
        tokio::task::spawn_blocking(move || {
            inject_word_layers(&in_clone, &out_clone, &opts_clone, &pages_clone)
        })
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: format!("{e:#}"),
        })?;
    }

    // Sidecar .txt path for PdfPlusText / TextOnly.
    let mut output_paths = vec![output.display().to_string()];
    if matches!(
        options.output,
        OcrOutputMode::PdfPlusText | OcrOutputMode::TextOnly
    ) {
        let txt_path = output.with_extension("txt");
        std::fs::write(&txt_path, plain_text)?;
        output_paths.push(txt_path.display().to_string());
    }

    let page_confidences: Vec<OcrPageConfidence> = pages
        .iter()
        .map(|page| {
            let confidence = average_confidence(&page.words);
            OcrPageConfidence {
                page_number: page.page_index + 1,
                confidence,
                low_confidence: confidence
                    .map(|value| value < LOW_CONFIDENCE_THRESHOLD)
                    .unwrap_or(false),
            }
        })
        .collect();
    let all_words: Vec<WordBox> = pages
        .iter()
        .flat_map(|page| page.words.iter().cloned())
        .collect();

    Ok(OcrResult {
        output_paths,
        pages_processed: page_count,
        characters_recognized: total_chars,
        average_confidence: average_confidence(&all_words),
        low_confidence_pages: page_confidences
            .iter()
            .filter(|page| page.low_confidence)
            .map(|page| page.page_number)
            .collect(),
        page_confidences,
        cache_hits: pages.iter().filter(|page| page.cache_hit).count() as u32,
        engine,
    })
}

pub(crate) async fn recognize_pdf_pages(
    input: &Path,
    page_count: u32,
    options: &OcrOptions,
    mupdf: Arc<crate::sidecars::mupdf::MupdfWrapper>,
    backend: Arc<dyn OcrBackend>,
    pool: SqlitePool,
    cancel: tokio_util::sync::CancellationToken,
) -> AppResult<Vec<RecognizedOcrPage>> {
    let hash_path = input.to_path_buf();
    let file_sha256 = tokio::task::spawn_blocking(move || sha256_file(&hash_path))
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
    let engine = backend.capabilities().id.to_string();
    let mut pages = Vec::with_capacity(page_count as usize);
    let mut misses = Vec::new();

    for page_index in 0..page_count {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let key = OcrCacheKey {
            file_sha256: file_sha256.clone(),
            page_index,
            dpi: options.dpi,
            language: options.language.clone(),
            engine: engine.clone(),
        };
        match ocr_cache::get(&pool, &key).await {
            Ok(Some(cached)) => pages.push(RecognizedOcrPage {
                page_index,
                words: parse_hocr_word(&cached.hocr),
                pixel_width: cached.pixel_width,
                pixel_height: cached.pixel_height,
                cache_hit: true,
            }),
            Ok(None) => misses.push(page_index),
            Err(error) => {
                tracing::warn!(
                    target: "ocr",
                    page_index,
                    "OCR cache read failed; recomputing page: {error:#}"
                );
                misses.push(page_index);
            }
        }
    }

    if !misses.is_empty() {
        let tempdir = tempfile::tempdir().map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
        let temp_root = tempdir.path().to_path_buf();
        let input = input.to_path_buf();
        let options = options.clone();
        let runtime = tokio::runtime::Handle::current();
        let computed = tokio::task::spawn_blocking(move || {
            misses
                .into_par_iter()
                .map(|page_index| {
                    if cancel.is_cancelled() {
                        return Err(AppError::Cancelled);
                    }
                    let raster_path = temp_root.join(format!("page-{page_index}.png"));
                    let key = OcrCacheKey {
                        file_sha256: file_sha256.clone(),
                        page_index,
                        dpi: options.dpi,
                        language: options.language.clone(),
                        engine: engine.clone(),
                    };
                    runtime.block_on(async {
                        mupdf
                            .render_page_to_png(
                                &input,
                                page_index,
                                &raster_path,
                                options.dpi,
                                Some(cancel.clone()),
                            )
                            .await?;
                        let (pixel_width, pixel_height) =
                            read_png_dimensions(&raster_path).unwrap_or((1, 1));
                        let recognition_options = OcrRecognitionOptions {
                            psm: options.psm,
                            oem: options.oem,
                            cancellation: Some(cancel.clone()),
                        };
                        let words = backend
                            .recognize(&raster_path, &options.language, &recognition_options)
                            .await?;
                        let cached = CachedOcrPage {
                            hocr: words_to_hocr(&words),
                            pixel_width,
                            pixel_height,
                        };
                        if let Err(error) = ocr_cache::put(&pool, &key, &cached).await {
                            tracing::warn!(
                                target: "ocr",
                                page_index,
                                "OCR cache write failed: {error:#}"
                            );
                        }
                        Ok(RecognizedOcrPage {
                            page_index,
                            words,
                            pixel_width,
                            pixel_height,
                            cache_hit: false,
                        })
                    })
                })
                .collect::<Vec<AppResult<RecognizedOcrPage>>>()
        })
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
        for page in computed {
            pages.push(page?);
        }
    }

    pages.sort_by_key(|page| page.page_index);
    Ok(pages)
}

pub(crate) fn recognized_pages_to_text(pages: &[RecognizedOcrPage]) -> String {
    let mut out = String::new();
    for page in pages {
        out.push_str(&words_to_plain_text(&page.words));
        out.push('\n');
    }
    out
}

fn sha256_file(path: &Path) -> anyhow::Result<String> {
    let file = std::fs::File::open(path)?;
    let mut reader = std::io::BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn read_png_dimensions(path: &Path) -> Option<(u32, u32)> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = [0u8; 24];
    f.read_exact(&mut buf).ok()?;
    // PNG: bytes 16..20 = width, 20..24 = height (big-endian).
    let w = u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]);
    let h = u32::from_be_bytes([buf[20], buf[21], buf[22], buf[23]]);
    Some((w, h))
}

/// Delta W: pick the font that will back the OCR invisible text layer.
///
/// Preference order:
///   1. Arial Regular (Windows default sans-serif, broad Unicode coverage).
///   2. First non-Standard-14 sans-serif font discoverable on the system.
///   3. None — caller falls back to Standard 14 Helvetica (ASCII only).
fn pick_ocr_font() -> Option<crate::services::fonts::SystemFont> {
    let all = fonts::list_system_fonts();
    // 1. Arial Regular (exact PostScript name).
    if let Some(f) = all
        .iter()
        .find(|f| f.postscript_name == "ArialMT" && !f.is_standard_14)
    {
        return Some(f.clone());
    }
    if let Some(f) = all
        .iter()
        .find(|f| f.family == "Arial" && f.style == "Regular" && !f.is_standard_14)
    {
        return Some(f.clone());
    }
    // 2. First non-Standard-14 sans-serif Regular face we can identify.
    let known_sans = [
        "Segoe UI",
        "Helvetica",
        "Liberation Sans",
        "DejaVu Sans",
        "Noto Sans",
        "Calibri",
        "Verdana",
        "Tahoma",
    ];
    for fam in known_sans.iter() {
        if let Some(f) = all
            .iter()
            .find(|f| f.family == *fam && f.style == "Regular" && !f.is_standard_14)
        {
            return Some(f.clone());
        }
    }
    // 3. Any non-monospace, non-italic, non-Standard-14 face.
    all.into_iter().find(|f| {
        !f.is_standard_14 && !f.italic && !f.monospace && !f.file_path.is_empty() && f.weight <= 500
    })
}

/// Open the PDF, append a /Contents reference per page that points to
/// the invisible text overlay, then save to `output`.
///
/// Delta W: the OCR text layer uses a Type0 CIDFont subset (Identity-H)
/// of a system sans-serif font (Arial preferred). This is required for
/// Slovak/Czech/German diacritics to round-trip through the Delta S inline
/// edit path — WinAnsi-encoded Helvetica cannot represent `č ě ř ů`.
///
/// If no system font is locatable, falls back to Standard 14 Helvetica.
/// This is the only allowed fallback (NON-NEGOTIABLE rule: no automatic
/// fallback for the regular text edit path; the OCR layer fallback exists
/// purely so the OCR feature does not hard-fail on a font-stripped host).
pub fn inject_text_layers(
    input: &Path,
    output: &Path,
    opts: &OcrOptions,
    hocrs: &[(u32, String, u32, u32)],
) -> anyhow::Result<()> {
    let pages: Vec<RecognizedOcrPage> = hocrs
        .iter()
        .map(
            |(page_index, hocr, pixel_width, pixel_height)| RecognizedOcrPage {
                page_index: *page_index,
                words: parse_hocr_word(hocr),
                pixel_width: *pixel_width,
                pixel_height: *pixel_height,
                cache_hit: false,
            },
        )
        .collect();
    inject_word_layers(input, output, opts, &pages)
}

pub(crate) fn inject_word_layers(
    input: &Path,
    output: &Path,
    _opts: &OcrOptions,
    pages: &[RecognizedOcrPage],
) -> anyhow::Result<()> {
    let mut doc = Document::load(input)?;
    let pages_map = doc.get_pages();

    // Pre-compute page dimensions so we can register every word with the
    // subsetter before emitting any content stream. write_to_pdf needs the
    // full used_chars set to produce a minimal subset.
    let page_specs: Vec<(u32, Vec<WordBox>, u32, u32, lopdf::ObjectId, f32, f32)> = pages
        .iter()
        .filter_map(|page| {
            let &page_id = pages_map.get(&(page.page_index + 1))?;
            let (page_w, page_h) = page_dimensions(&doc, page_id).unwrap_or((612.0, 792.0));
            Some((
                page.page_index,
                page.words.clone(),
                page.pixel_width,
                page.pixel_height,
                page_id,
                page_w,
                page_h,
            ))
        })
        .collect();

    // Pick + load the embedded font once.
    let picked = pick_ocr_font();
    let mut subsetter: Option<FontSubsetter> = match picked.as_ref() {
        Some(f) if !f.file_path.is_empty() => {
            match FontSubsetter::new_from_path(Path::new(&f.file_path)) {
                Ok(s) => Some(s),
                Err(e) => {
                    tracing::warn!(target: "ocr", "could not load OCR font {} ({e:#}); falling back to Helvetica", f.file_path);
                    None
                }
            }
        }
        _ => None,
    };

    // Build all content streams first so the subsetter sees every char.
    let mut stream_specs: Vec<(lopdf::ObjectId, Vec<u8>)> = Vec::new();
    for (_, words, pixel_w, pixel_h, page_id, page_w, page_h) in &page_specs {
        let bytes = build_invisible_text_stream(
            words,
            *pixel_w,
            *pixel_h,
            *page_w,
            *page_h,
            subsetter.as_mut(),
        );
        stream_specs.push((*page_id, bytes));
    }

    // Emit the font ONCE, then register /F1 on each touched page.
    let font_obj_id = if let Some(ref s) = subsetter {
        let (id, _tag) = s.write_to_pdf(&mut doc)?;
        Some(id)
    } else {
        // Standard 14 Helvetica fallback. Per the user directive ("NO
        // automatic fallback to Standard 14"), this path is reached only
        // when the host machine has no usable system font. The OCR feature
        // still completes, but diacritic editing will surface
        // EncodingMismatch downstream — the expected/documented behaviour.
        let helv_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
            "Encoding" => "WinAnsiEncoding",
        });
        Some(helv_id)
    };

    for (page_id, stream_bytes) in stream_specs {
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
                if let Some(fid) = font_obj_id {
                    ensure_helv_font(d, fid);
                }
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
pub async fn detect_scanned_pdf(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<ScanLikelihood> {
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
