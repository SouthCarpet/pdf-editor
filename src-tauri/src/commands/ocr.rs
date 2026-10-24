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
    average_confidence, build_invisible_text_stream_with_font, parse_hocr_word, words_to_hocr,
    words_to_plain_text, OcrBackend, OcrEngine, OcrOptions, OcrOutputMode, OcrRecognitionOptions,
    WordBox, LOW_CONFIDENCE_THRESHOLD,
};
use crate::services::ocr_geometry::{
    add_page_font_resource, open_page_state_guard, page_geometry, OcrPageGeometry,
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
    pub backend_notice: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OcrBackendInfo {
    pub id: String,
    pub display_name: String,
    pub supported_languages: Vec<String>,
    pub supports_multi_language: bool,
    pub available: bool,
    pub unavailable_reason: Option<String>,
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
    pub cache_key: Option<OcrCacheKey>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ScanLikelihood {
    pub is_likely_scanned: bool,
    pub avg_chars_per_page: f64,
    pub total_pages: u32,
}

#[tauri::command]
#[specta::specta]
pub fn list_ocr_backends(state: State<'_, AppState>) -> Vec<OcrBackendInfo> {
    let tesseract = state.tesseract.capabilities();
    let mut backends = vec![OcrBackendInfo {
        id: tesseract.id.into(),
        display_name: tesseract.display_name.into(),
        supported_languages: tesseract
            .supported_languages
            .iter()
            .map(|language| (*language).to_string())
            .collect(),
        supports_multi_language: tesseract.supports_multi_language,
        available: true,
        unavailable_reason: None,
    }];

    #[cfg(windows)]
    {
        use crate::services::rapidocr::RAPID_OCR_LANGUAGES;
        backends.push(OcrBackendInfo {
            id: "rapidocr".into(),
            display_name: "RapidOCR".into(),
            supported_languages: RAPID_OCR_LANGUAGES
                .iter()
                .map(|language| (*language).to_string())
                .collect(),
            supports_multi_language: true,
            available: state.rapidocr.backend.is_some(),
            unavailable_reason: state.rapidocr.unavailable_reason.clone(),
        });
    }
    backends
}

#[tauri::command]
#[specta::specta]
pub async fn ocr_pdf_cmd(state: State<'_, AppState>, args: OcrArgs) -> AppResult<OcrResult> {
    let token = state.cancellation.register(&args.job_id);
    let in_path = PathBuf::from(&args.input);
    let out_path = PathBuf::from(&args.output);
    let opts = args.options.clone();
    let mupdf = state.mupdf.clone();
    let backends = match opts.engine {
        OcrEngine::Tesseract => OcrBackends {
            primary: state.tesseract.clone(),
            fallback: None,
            notice: None,
        },
        OcrEngine::RapidOcr => {
            #[cfg(windows)]
            {
                if let Some(rapidocr) = state.rapidocr.backend.clone() {
                    OcrBackends {
                        primary: rapidocr,
                        fallback: Some(state.tesseract.clone()),
                        notice: None,
                    }
                } else {
                    OcrBackends {
                        primary: state.tesseract.clone(),
                        fallback: None,
                        notice: Some(format!(
                            "RapidOCR is unavailable: {}. Tesseract was used.",
                            state
                                .rapidocr
                                .unavailable_reason
                                .as_deref()
                                .unwrap_or("vendored runtime could not be loaded")
                        )),
                    }
                }
            }
            #[cfg(not(windows))]
            {
                OcrBackends {
                    primary: state.tesseract.clone(),
                    fallback: None,
                    notice: Some(
                        "RapidOCR is unavailable on this platform. Tesseract was used.".into(),
                    ),
                }
            }
        }
    };
    let pool = state.pool.clone();

    let result = ocr_pdf(
        in_path,
        out_path.clone(),
        opts,
        mupdf,
        backends,
        pool,
        token,
    )
    .await;
    state.cancellation.forget(&args.job_id);
    let processed = result?;
    Ok(processed)
}

/// The resolved engine choice for one OCR run.
///
/// These three values are produced together by the engine selection and
/// consumed together. Passing them as a bare triple pushed both the tuple
/// type and this function's parameter list past clippy's complexity limits,
/// and the grouping is what the code meant anyway.
struct OcrBackends {
    primary: Arc<dyn OcrBackend>,
    /// Only ever set for RapidOCR, which may fall back to Tesseract.
    fallback: Option<Arc<dyn OcrBackend>>,
    /// Set when the requested engine could not be used, so the result can say why.
    notice: Option<String>,
}

async fn ocr_pdf(
    input: PathBuf,
    output: PathBuf,
    options: OcrOptions,
    mupdf: Arc<crate::sidecars::mupdf::MupdfWrapper>,
    backends: OcrBackends,
    pool: SqlitePool,
    cancel: tokio_util::sync::CancellationToken,
) -> AppResult<OcrResult> {
    let OcrBackends {
        primary: backend,
        fallback,
        notice: mut backend_notice,
    } = backends;
    // Load doc up-front to enumerate pages + bbox.
    let page_count = {
        let doc =
            crate::services::pdf_guard::load_guarded(&input).map_err(|e| AppError::Internal {
                detail: format!("load: {e}"),
            })?;
        doc.get_pages().len() as u32
    };

    let run = OcrRun {
        input: &input,
        page_count,
        options: &options,
        mupdf: &mupdf,
        pool: &pool,
        cancel: &cancel,
    };
    let (pages, engine) =
        recognize_with_fallback(&run, backend, fallback, &mut backend_notice).await?;
    let plain_text = recognized_pages_to_text(&pages);
    let total_chars = pages
        .iter()
        .flat_map(|page| page.words.iter())
        .map(|word| word.text.chars().count())
        .sum();

    let output_paths = write_ocr_outputs(&input, &output, &options, &pages, plain_text).await?;

    let page_confidences = build_page_confidences(&pages);
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
        backend_notice,
    })
}

/// Borrowed inputs shared by the primary and the fallback recognition pass.
struct OcrRun<'a> {
    input: &'a Path,
    page_count: u32,
    options: &'a OcrOptions,
    mupdf: &'a Arc<crate::sidecars::mupdf::MupdfWrapper>,
    pool: &'a SqlitePool,
    cancel: &'a tokio_util::sync::CancellationToken,
}

impl OcrRun<'_> {
    async fn recognize(&self, backend: Arc<dyn OcrBackend>) -> AppResult<Vec<RecognizedOcrPage>> {
        recognize_pdf_pages(
            self.input,
            self.page_count,
            self.options,
            self.mupdf.clone(),
            backend,
            self.pool.clone(),
            self.cancel.clone(),
        )
        .await
    }
}

/// Recognizes with the primary backend. A failed RapidOCR run retries the
/// whole document with the fallback and records why in `backend_notice`.
async fn recognize_with_fallback(
    run: &OcrRun<'_>,
    backend: Arc<dyn OcrBackend>,
    fallback: Option<Arc<dyn OcrBackend>>,
    backend_notice: &mut Option<String>,
) -> AppResult<(Vec<RecognizedOcrPage>, String)> {
    let primary_engine = backend.capabilities().id.to_string();
    match run.recognize(backend).await {
        Ok(pages) => Ok((pages, primary_engine)),
        Err(AppError::Cancelled) => Err(AppError::Cancelled),
        Err(error) => {
            let Some(fallback) = fallback else {
                return Err(error);
            };
            tracing::warn!(
                target: "ocr",
                "RapidOCR recognition failed; retrying the document with Tesseract: {error}"
            );
            *backend_notice = Some(format!(
                "RapidOCR failed: {error}. Tesseract was used for this document."
            ));
            let fallback_engine = fallback.capabilities().id.to_string();
            let pages = run.recognize(fallback).await?;
            Ok((pages, fallback_engine))
        }
    }
}

/// Writes the overlay PDF (unless TextOnly) and the sidecar .txt (for
/// PdfPlusText and TextOnly). Returns every output path.
async fn write_ocr_outputs(
    input: &Path,
    output: &Path,
    options: &OcrOptions,
    pages: &[RecognizedOcrPage],
    plain_text: String,
) -> AppResult<Vec<String>> {
    // Inject overlays unless TextOnly mode.
    if !matches!(options.output, OcrOutputMode::TextOnly) {
        let in_clone = input.to_path_buf();
        let out_clone = output.to_path_buf();
        let opts_clone = options.clone();
        let pages_clone = pages.to_vec();
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
    Ok(output_paths)
}

fn build_page_confidences(pages: &[RecognizedOcrPage]) -> Vec<OcrPageConfidence> {
    pages
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
        .collect()
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
    let (mut pages, misses) =
        scan_ocr_cache(&pool, &file_sha256, &engine, options, page_count, &cancel).await?;

    if !misses.is_empty() {
        let recognizer = MissRecognizer {
            input: input.to_path_buf(),
            options: options.clone(),
            mupdf,
            backend,
            pool,
            cancel,
            file_sha256,
            engine,
        };
        pages.extend(recognizer.run(misses).await?);
    }

    pages.sort_by_key(|page| page.page_index);
    Ok(pages)
}

fn page_cache_key(
    file_sha256: &str,
    page_index: u32,
    engine: &str,
    options: &OcrOptions,
) -> OcrCacheKey {
    OcrCacheKey {
        file_sha256: file_sha256.to_string(),
        page_index,
        dpi: options.dpi,
        language: options.language.clone(),
        engine: engine.to_string(),
    }
}

/// Reads every page from the OCR cache. Returns the cached pages and the
/// indexes that still need recognition (cache miss or cache read error).
async fn scan_ocr_cache(
    pool: &SqlitePool,
    file_sha256: &str,
    engine: &str,
    options: &OcrOptions,
    page_count: u32,
    cancel: &tokio_util::sync::CancellationToken,
) -> AppResult<(Vec<RecognizedOcrPage>, Vec<u32>)> {
    let mut pages = Vec::with_capacity(page_count as usize);
    let mut misses = Vec::new();

    for page_index in 0..page_count {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let key = page_cache_key(file_sha256, page_index, engine, options);
        match ocr_cache::get(pool, &key).await {
            Ok(Some(cached)) => pages.push(RecognizedOcrPage {
                page_index,
                words: parse_hocr_word(&cached.hocr),
                pixel_width: cached.pixel_width,
                pixel_height: cached.pixel_height,
                cache_hit: true,
                cache_key: Some(key),
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
    Ok((pages, misses))
}

/// Everything needed to rasterize and recognize the pages missing from the cache.
struct MissRecognizer {
    input: PathBuf,
    options: OcrOptions,
    mupdf: Arc<crate::sidecars::mupdf::MupdfWrapper>,
    backend: Arc<dyn OcrBackend>,
    pool: SqlitePool,
    cancel: tokio_util::sync::CancellationToken,
    file_sha256: String,
    engine: String,
}

impl MissRecognizer {
    async fn run(self, misses: Vec<u32>) -> AppResult<Vec<RecognizedOcrPage>> {
        let tempdir = tempfile::tempdir().map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
        let temp_root = tempdir.path().to_path_buf();
        let runtime = tokio::runtime::Handle::current();
        let computed = tokio::task::spawn_blocking(move || {
            misses
                .into_par_iter()
                .map(|page_index| {
                    if self.cancel.is_cancelled() {
                        return Err(AppError::Cancelled);
                    }
                    runtime.block_on(self.recognize_page(&temp_root, page_index))
                })
                .collect::<Vec<AppResult<RecognizedOcrPage>>>()
        })
        .await
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
        computed.into_iter().collect()
    }

    async fn recognize_page(
        &self,
        temp_root: &Path,
        page_index: u32,
    ) -> AppResult<RecognizedOcrPage> {
        let raster_path = temp_root.join(format!("page-{page_index}.png"));
        let key = page_cache_key(&self.file_sha256, page_index, &self.engine, &self.options);
        self.mupdf
            .render_page_to_png(
                &self.input,
                page_index,
                &raster_path,
                self.options.dpi,
                Some(self.cancel.clone()),
            )
            .await?;
        let (pixel_width, pixel_height) = read_png_dimensions(&raster_path).unwrap_or((1, 1));
        let recognition_options = OcrRecognitionOptions {
            psm: self.options.psm,
            oem: self.options.oem,
            cancellation: Some(self.cancel.clone()),
        };
        let words = self
            .backend
            .recognize(&raster_path, &self.options.language, &recognition_options)
            .await?;
        let cached = CachedOcrPage {
            hocr: words_to_hocr(&words),
            pixel_width,
            pixel_height,
        };
        if let Err(error) = ocr_cache::put(&self.pool, &key, &cached).await {
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
            cache_key: Some(key),
        })
    }
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
/// One page's worth of what the text-layer writer needs, in emit order:
/// page index, recognized words, pixel width and height, the page's object id,
/// its resolved geometry, and the cache key when the page was cacheable.
///
/// Kept as a tuple rather than a struct because it is built and consumed in a
/// single pipeline a few lines apart; the alias exists so the type is nameable.
type PageSpec = (
    u32,
    Vec<WordBox>,
    u32,
    u32,
    lopdf::ObjectId,
    OcrPageGeometry,
    Option<OcrCacheKey>,
);

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
                cache_key: None,
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
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
    let pages_map = doc.get_pages();

    // Pre-compute page dimensions so we can register every word with the
    // subsetter before emitting any content stream. write_to_pdf needs the
    // full used_chars set to produce a minimal subset.
    let page_specs = collect_page_specs(&doc, &pages_map, pages)?;

    // Pick + load the embedded font once.
    let mut subsetter = load_ocr_subsetter();

    // Build all content streams first so the subsetter sees every char.
    let stream_specs = build_overlay_streams(&page_specs, subsetter.as_mut());

    // Emit the font ONCE, then register /F1 on each touched page.
    let font_id = embed_ocr_font(&mut doc, subsetter.as_ref())?;

    for (spec, (_, stream_bytes)) in page_specs.iter().zip(stream_specs) {
        append_ocr_overlay(&mut doc, spec, stream_bytes, font_id)?;
    }

    doc.compress();
    doc.save(output)?;
    Ok(())
}

fn collect_page_specs(
    doc: &Document,
    pages_map: &std::collections::BTreeMap<u32, lopdf::ObjectId>,
    pages: &[RecognizedOcrPage],
) -> anyhow::Result<Vec<PageSpec>> {
    pages
        .iter()
        .map(|page| -> anyhow::Result<_> {
            let &page_id = pages_map.get(&(page.page_index + 1)).ok_or_else(|| {
                anyhow::anyhow!("OCR page {} does not exist", page.page_index + 1)
            })?;
            if page_has_pipeline_ocr_layer(doc, page_id)? {
                return Err(anyhow::anyhow!(
                    "page {} already contains a pipeline-owned OCR layer; refusing to append a duplicate",
                    page.page_index + 1
                ));
            }
            let geometry = page_geometry(doc, page_id)?;
            Ok((
                page.page_index,
                page.words.clone(),
                page.pixel_width,
                page.pixel_height,
                page_id,
                geometry,
                page.cache_key.clone(),
            ))
        })
        .collect()
}

fn load_ocr_subsetter() -> Option<FontSubsetter> {
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

    // Plan 067 W5: the OCR layer is editable text, so the subset carries a
    // fixed Latin editing alphabet on top of the recognized words. Without it
    // the subset holds only what the scan contained and the first edit that
    // types any other letter fails with EncodingMismatch. Registered once per
    // document, before the content streams are built, because write_to_pdf
    // needs the complete used_chars set.
    if let Some(subsetter) = subsetter.as_mut() {
        subsetter.add_editing_alphabet();
    }
    subsetter
}

fn build_overlay_streams(
    page_specs: &[PageSpec],
    mut subsetter: Option<&mut FontSubsetter>,
) -> Vec<(lopdf::ObjectId, Vec<u8>)> {
    let mut stream_specs: Vec<(lopdf::ObjectId, Vec<u8>)> = Vec::new();
    for (_, words, pixel_w, pixel_h, page_id, geometry, _) in page_specs {
        let (display_width, display_height) = geometry.display_dimensions();
        let bytes = build_invisible_text_stream_with_font(
            words,
            *pixel_w,
            *pixel_h,
            display_width,
            display_height,
            b"AnimusOcrF",
            subsetter.as_deref_mut(),
        );
        stream_specs.push((*page_id, geometry.wrap_display_content(bytes)));
    }
    stream_specs
}

fn embed_ocr_font(
    doc: &mut Document,
    subsetter: Option<&FontSubsetter>,
) -> anyhow::Result<lopdf::ObjectId> {
    if let Some(s) = subsetter {
        let (id, _tag) = s.write_to_pdf(doc)?;
        Ok(id)
    } else {
        // Standard 14 Helvetica fallback. Per the user directive ("NO
        // automatic fallback to Standard 14"), this path is reached only
        // when the host machine has no usable system font. The OCR feature
        // still completes, but diacritic editing will surface
        // EncodingMismatch downstream — the expected/documented behaviour.
        Ok(doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
            "Encoding" => "WinAnsiEncoding",
        }))
    }
}

fn ocr_layer_dict(
    words: &[WordBox],
    pixel_w: u32,
    pixel_h: u32,
    cache_key: &Option<OcrCacheKey>,
) -> anyhow::Result<lopdf::Dictionary> {
    let mut stream_dict = dictionary! {
        "AnimusOcrLayer" => true,
        "AnimusOcrVersion" => 1,
        "AnimusOcrWords" => Object::string_literal(serde_json::to_string(words)?),
        "AnimusPixelWidth" => i64::from(pixel_w),
        "AnimusPixelHeight" => i64::from(pixel_h),
    };
    if let Some(key) = cache_key {
        stream_dict.set(
            "AnimusSourceSha256",
            Object::string_literal(key.file_sha256.clone()),
        );
        stream_dict.set("AnimusOcrDpi", i64::from(key.dpi));
        stream_dict.set(
            "AnimusOcrLanguage",
            Object::string_literal(key.language.clone()),
        );
        stream_dict.set(
            "AnimusOcrEngine",
            Object::string_literal(key.engine.clone()),
        );
    }
    Ok(stream_dict)
}

fn append_ocr_overlay(
    doc: &mut Document,
    spec: &PageSpec,
    stream_bytes: Vec<u8>,
    font_id: lopdf::ObjectId,
) -> anyhow::Result<()> {
    let (_, words, pixel_w, pixel_h, page_id, _, cache_key) = spec;
    let stream_dict = ocr_layer_dict(words, *pixel_w, *pixel_h, cache_key)?;
    // The page's own content can leave the CTM scaled (a scan's bare
    // `<w> 0 0 <h> 0 0 cm /Im0 Do` is the common case). The guard pushes
    // the graphics state in front of that content and hands back the `Q`
    // this overlay opens with, so the text below is placed in the page's
    // default space instead of the previous stream's leftovers.
    let close_state_guard = open_page_state_guard(doc, *page_id)?;
    let mut content = close_state_guard.to_vec();
    content.extend(stream_bytes);
    let stream_id = doc.add_object(Object::Stream(Stream::new(stream_dict, content)));
    add_page_font_resource(doc, *page_id, b"AnimusOcrF", font_id)?;
    let page = doc.get_object_mut(*page_id)?.as_dict_mut()?;
    let mut contents: Vec<Object> = match page.get(b"Contents").cloned() {
        Ok(Object::Array(items)) => items,
        Ok(existing) => vec![existing],
        Err(_) => Vec::new(),
    };
    contents.push(Object::Reference(stream_id));
    page.set("Contents", contents);
    Ok(())
}

fn page_has_pipeline_ocr_layer(doc: &Document, page_id: lopdf::ObjectId) -> anyhow::Result<bool> {
    let page = doc.get_object(page_id)?.as_dict()?;
    let Some(contents) = page.get(b"Contents").ok() else {
        return Ok(false);
    };
    // /Contents is legally a stream, an array of streams, or an INDIRECT
    // REFERENCE to either. Resolving only the array entries and not the
    // /Contents value itself let `/Contents 5 0 R -> [6 0 R 7 0 R]` slip past
    // this guard entirely, which is the duplicate-layer case it exists to
    // prevent.
    let resolved = match contents {
        Object::Reference(id) => doc.get_object(*id)?,
        object => object,
    };
    let items: Vec<&Object> = match resolved {
        Object::Array(items) => items.iter().collect(),
        object => vec![object],
    };
    for item in items {
        let object = match item {
            Object::Reference(id) => doc.get_object(*id)?,
            object => object,
        };
        if let Object::Stream(stream) = object {
            if matches!(
                stream.dict.get(b"AnimusOcrLayer"),
                Ok(Object::Boolean(true))
            ) {
                return Ok(true);
            }
        }
    }
    Ok(false)
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
