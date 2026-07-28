// OCR engine — sidecar-routed for this build (the in-process Rust tesseract
// crate is deferred because `leptonica-sys` requires a vcpkg-installed
// leptonica). The wrapper API is preserved so we can flip back to
// in-process later without API churn.
//
// Phase 13 Task 70 — exposes:
//   - OcrOptions (multi-language, DPI, PSM, OEM, output mode, deskew, ...)
//   - build_invisible_text_stream(): emits a /Contents stream with `3 Tr`
//     (invisible) Tj operators that mirror OCR word bboxes, producing a
//     selectable / accessible / searchable text layer.
//   - parse_hocr_word(): pulls (text, bbox) tuples out of tesseract hOCR.
//   - build_text_layer_from_hocr(): full-pipeline helper used by the
//     commands::ocr handler.

use crate::error::AppResult;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OcrOptions {
    /// Tesseract language codes joined by `+` (e.g. "eng+slk+ces").
    pub language: String,
    /// Render DPI for the rasterized page handed to tesseract. 300 is
    /// the spec default; higher boosts accuracy for small fonts but
    /// slows the run linearly.
    pub dpi: u32,
    /// Tesseract page segmentation mode (0..13). 3 = "auto" is the default.
    pub psm: u8,
    /// Tesseract OCR engine mode (0..3). 3 = LSTM is the default on 5.x.
    pub oem: u8,
    /// Output mode determines the post-OCR write-out shape.
    pub output: OcrOutputMode,
    pub deskew: bool,
    pub despeckle: bool,
    /// When true, the original rasterized page is preserved under the
    /// text layer (highest fidelity). When false, only the text layer is
    /// written and the page rasterization is dropped (smallest file).
    pub preserve_raster: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OcrOutputMode {
    /// Inject an invisible text layer into the existing PDF.
    SearchablePdf,
    /// Inject a layer AND write the recognized text to a sidecar `.txt`.
    PdfPlusText,
    /// Write only the recognized text to a sidecar `.txt` (PDF unchanged).
    TextOnly,
}

impl Default for OcrOptions {
    fn default() -> Self {
        Self {
            language: "eng".into(),
            dpi: 300,
            psm: 3,
            oem: 3,
            output: OcrOutputMode::SearchablePdf,
            deskew: true,
            despeckle: false,
            preserve_raster: true,
        }
    }
}

/// Routing threshold per `engine_ocr_stack` vault spec: <=10 pages would
/// route in-process when the tesseract Rust crate is enabled. On this
/// build everything routes through the sidecar. Kept public so command
/// handlers don't change shape when the in-process path is re-enabled.
pub const OCR_SIDECAR_THRESHOLD: usize = 10;
pub const LOW_CONFIDENCE_THRESHOLD: f32 = 80.0;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WordBox {
    pub text: String,
    pub bbox: [i32; 4],
    pub confidence: Option<f32>,
    pub paragraph_index: u32,
    pub line_index: u32,
    pub reading_order: u32,
}

pub type HocrWord = WordBox;

#[derive(Debug, Clone)]
pub struct OcrRecognitionOptions {
    pub psm: u8,
    pub oem: u8,
    pub cancellation: Option<CancellationToken>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OcrBackendCapabilities {
    pub id: &'static str,
    pub display_name: &'static str,
    pub supported_languages: &'static [&'static str],
    pub supports_multi_language: bool,
    pub provides_word_confidence: bool,
}

pub type OcrBackendFuture<'a> = Pin<Box<dyn Future<Output = AppResult<Vec<WordBox>>> + Send + 'a>>;

pub trait OcrBackend: Send + Sync {
    fn capabilities(&self) -> OcrBackendCapabilities;

    fn recognize<'a>(
        &'a self,
        image: &'a Path,
        lang: &'a str,
        opts: &'a OcrRecognitionOptions,
    ) -> OcrBackendFuture<'a>;
}

/// Sidecar-only placeholder; the real entrypoint lives in
/// `commands::ocr::ocr_pdf_cmd` which composes MupdfWrapper +
/// TesseractWrapper + this module's `build_text_layer_from_hocr`.
pub fn ocr_pdf_add_text_layer(_input: &Path, _output: &Path, _opts: &OcrOptions) -> Result<()> {
    Err(anyhow!(
        "ocr_pdf_add_text_layer is sidecar-only on this build; use commands::ocr::ocr_pdf_cmd"
    ))
}

/// Pull every `ocrx_word` span out of a Tesseract hOCR document while
/// retaining its paragraph, line, precise bbox, reading order, and x_wconf.
pub fn parse_hocr_word(hocr: &str) -> Vec<HocrWord> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    let mut paragraph_index = 0u32;
    let mut line_index = 0u32;
    let mut next_paragraph = 0u32;
    let mut next_line = 0u32;
    let mut has_paragraph = false;
    let mut has_line = false;

    while let Some(relative_start) = hocr[cursor..].find('<') {
        let tag_start = cursor + relative_start;
        let Some(relative_end) = hocr[tag_start..].find('>') else {
            break;
        };
        let tag_end = tag_start + relative_end + 1;
        let tag = &hocr[tag_start..tag_end];

        if tag_has_class(tag, "ocr_par") {
            paragraph_index = next_paragraph;
            next_paragraph += 1;
            has_paragraph = true;
            has_line = false;
        } else if tag_has_class(tag, "ocr_line") {
            if !has_paragraph {
                paragraph_index = next_paragraph;
                next_paragraph += 1;
                has_paragraph = true;
            }
            line_index = next_line;
            next_line += 1;
            has_line = true;
        } else if tag_has_class(tag, "ocrx_word") {
            if !has_paragraph {
                paragraph_index = next_paragraph;
                next_paragraph += 1;
                has_paragraph = true;
            }
            if !has_line {
                line_index = next_line;
                next_line += 1;
                has_line = true;
            }
            let Some(relative_text_end) = hocr[tag_end..].find("</span>") else {
                break;
            };
            let text_end = tag_end + relative_text_end;
            let text = html_unescape(hocr[tag_end..text_end].trim());
            if let Some(bbox) = parse_bbox(tag) {
                if !text.is_empty() {
                    out.push(HocrWord {
                        text,
                        bbox,
                        confidence: parse_confidence(tag),
                        paragraph_index,
                        line_index,
                        reading_order: out.len() as u32,
                    });
                }
            }
            cursor = text_end + "</span>".len();
            continue;
        }
        cursor = tag_end;
    }
    words_in_reading_order(&out)
}

fn parse_bbox(tag: &str) -> Option<[i32; 4]> {
    let i = tag.find("bbox ")?;
    let after = &tag[i + 5..];
    // Take only the next 4 whitespace-separated tokens; tolerate trailing
    // semicolons / quotes / `>` from the surrounding tag syntax.
    let nums: Vec<i32> = after
        .split(|c: char| c.is_whitespace() || c == ';' || c == '"' || c == '\'' || c == '>')
        .filter(|s| !s.is_empty())
        .take(4)
        .filter_map(|s| s.parse::<i32>().ok())
        .collect();
    if nums.len() < 4 {
        return None;
    }
    Some([nums[0], nums[1], nums[2], nums[3]])
}

fn parse_confidence(tag: &str) -> Option<f32> {
    let i = tag.find("x_wconf ")?;
    let token = tag[i + "x_wconf ".len()..]
        .split(|c: char| c.is_whitespace() || c == ';' || c == '"' || c == '\'' || c == '>')
        .find(|s| !s.is_empty())?;
    token
        .parse::<f32>()
        .ok()
        .map(|value| value.clamp(0.0, 100.0))
}

fn tag_has_class(tag: &str, wanted: &str) -> bool {
    let Some(class_pos) = tag.find("class=") else {
        return false;
    };
    let after = &tag[class_pos + "class=".len()..];
    let Some(quote) = after.chars().next() else {
        return false;
    };
    if quote != '\'' && quote != '"' {
        return false;
    }
    let value = &after[quote.len_utf8()..];
    let Some(end) = value.find(quote) else {
        return false;
    };
    value[..end].split_whitespace().any(|class| class == wanted)
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub fn words_in_reading_order(words: &[WordBox]) -> Vec<WordBox> {
    let mut ordered = words.to_vec();
    ordered.sort_by_key(|word| {
        (
            word.paragraph_index,
            word.line_index,
            word.bbox[0],
            word.reading_order,
        )
    });
    for (index, word) in ordered.iter_mut().enumerate() {
        word.reading_order = index as u32;
    }
    ordered
}

pub fn words_to_hocr(words: &[WordBox]) -> String {
    let ordered = words_in_reading_order(words);
    let mut out = String::from("<html><body>");
    let mut current_paragraph = None;
    let mut current_line = None;

    for word in ordered {
        if current_paragraph != Some(word.paragraph_index) {
            if current_line.take().is_some() {
                out.push_str("</span>");
            }
            if current_paragraph.take().is_some() {
                out.push_str("</p>");
            }
            out.push_str(&format!(
                "<p class='ocr_par' id='par_{}'>",
                word.paragraph_index
            ));
            current_paragraph = Some(word.paragraph_index);
        }
        if current_line != Some(word.line_index) {
            if current_line.take().is_some() {
                out.push_str("</span>");
            }
            out.push_str(&format!(
                "<span class='ocr_line' id='line_{}'>",
                word.line_index
            ));
            current_line = Some(word.line_index);
        }
        let confidence = word
            .confidence
            .map(|value| format!("; x_wconf {}", value.round() as u32))
            .unwrap_or_default();
        out.push_str(&format!(
            "<span class='ocrx_word' title='bbox {} {} {} {}{}'>{}</span>",
            word.bbox[0],
            word.bbox[1],
            word.bbox[2],
            word.bbox[3],
            confidence,
            html_escape(&word.text)
        ));
    }
    if current_line.is_some() {
        out.push_str("</span>");
    }
    if current_paragraph.is_some() {
        out.push_str("</p>");
    }
    out.push_str("</body></html>");
    out
}

pub fn average_confidence(words: &[WordBox]) -> Option<f32> {
    let (sum, count) = words
        .iter()
        .filter_map(|word| word.confidence)
        .fold((0.0f32, 0usize), |(sum, count), confidence| {
            (sum + confidence, count + 1)
        });
    (count > 0).then(|| sum / count as f32)
}

/// Build a PDF content stream that paints invisible text (`3 Tr`)
/// matching the supplied hOCR words. Bbox pixels are mapped from the
/// raster page space (pixel_w / pixel_h at the rasterization DPI) to PDF
/// points (page_w_pt / page_h_pt).
///
/// Delta W: the resulting stream uses `/F1 Tf` but `/F1` is bound by the
/// caller to a Type0 CIDFont subset emitted via `FontSubsetter`. Identity-H
/// CIDs are emitted as hex strings (e.g. `<00480065006C006C006F>`) so
/// Slovak/Czech/German diacritics (`č ě ř ů ä ö ü ß`) survive the round-
/// trip and remain editable through the Delta S inline-edit path.
///
/// When `font_subsetter` is `None` (Standard 14 fallback), the legacy
/// WinAnsi-encoded literal strings are emitted. The fallback covers ASCII
/// only — diacritics are passed through verbatim and may not round-trip.
pub fn build_invisible_text_stream(
    words: &[HocrWord],
    pixel_w: u32,
    pixel_h: u32,
    page_w_pt: f32,
    page_h_pt: f32,
    font_subsetter: Option<&mut crate::services::font_embed::FontSubsetter>,
) -> Vec<u8> {
    let ordered = words_in_reading_order(words);
    let mut out = String::new();
    out.push_str("BT\n");
    out.push_str("3 Tr\n"); // invisible (neither stroke nor fill)
    out.push_str("/F1 1 Tf\n"); // font + size 1 (we scale via Tm)

    let sx = page_w_pt / pixel_w as f32;
    let sy = page_h_pt / pixel_h as f32;

    // Type0 path: register every char with the subsetter so the embedded
    // FontFile2 includes the right glyphs. We register BEFORE emitting the
    // operators so all subset bookkeeping is complete when the caller later
    // invokes `write_to_pdf`.
    if let Some(ref sub) = font_subsetter.as_ref() {
        let _ = sub; // borrow check: re-borrowed below as &mut
    }
    if let Some(sub) = font_subsetter {
        for w in &ordered {
            sub.add_text(&w.text);
        }
        for w in &ordered {
            let x = w.bbox[0] as f32 * sx;
            let y = page_h_pt - w.bbox[3] as f32 * sy;
            let h = (w.bbox[3] - w.bbox[1]).max(1) as f32 * sy;
            out.push_str(&format!("{h} 0 0 {h} {x} {y} Tm\n", h = h, x = x, y = y));
            // Identity-H CID string: 2 bytes per glyph, hex-encoded.
            let cids = sub.encode_text_as_cids(&w.text);
            out.push('<');
            for b in cids {
                out.push_str(&format!("{:02X}", b));
            }
            out.push_str("> Tj\n");
        }
    } else {
        for w in &ordered {
            let x = w.bbox[0] as f32 * sx;
            let y = page_h_pt - w.bbox[3] as f32 * sy;
            let h = (w.bbox[3] - w.bbox[1]).max(1) as f32 * sy;
            out.push_str(&format!("{h} 0 0 {h} {x} {y} Tm\n", h = h, x = x, y = y));
            let escaped = w
                .text
                .replace('\\', "\\\\")
                .replace('(', "\\(")
                .replace(')', "\\)");
            out.push_str(&format!("({}) Tj\n", escaped));
        }
    }
    out.push_str("ET\n");
    out.into_bytes()
}

pub fn words_to_plain_text(words: &[WordBox]) -> String {
    let ordered = words_in_reading_order(words);
    let mut out = String::new();
    let mut previous: Option<(u32, u32)> = None;
    for word in ordered {
        match previous {
            Some((paragraph, _)) if paragraph != word.paragraph_index => {
                out.push_str("\n\n");
            }
            Some((_, line)) if line != word.line_index => out.push('\n'),
            Some(_) => out.push(' '),
            None => {}
        }
        out.push_str(&word.text);
        previous = Some((word.paragraph_index, word.line_index));
    }
    out
}

/// Compose `parse_hocr_word` + `build_invisible_text_stream` and return
/// the bytes ready to inject as a `/Contents` overlay onto the page.
///
/// `font_subsetter` is the Type0 CIDFont subsetter that will be written to
/// the PDF by the caller after every page's content stream is built. When
/// `None`, the legacy WinAnsi/Helvetica fallback is used (Standard 14 path,
/// ASCII only — the fallback exists for the "no system font available"
/// degraded path; the regular ocr_pdf_cmd path always supplies a subsetter).
pub fn build_text_layer_from_hocr(
    hocr: &str,
    pixel_w: u32,
    pixel_h: u32,
    page_w_pt: f32,
    page_h_pt: f32,
    font_subsetter: Option<&mut crate::services::font_embed::FontSubsetter>,
) -> Vec<u8> {
    let words = parse_hocr_word(hocr);
    build_invisible_text_stream(
        &words,
        pixel_w,
        pixel_h,
        page_w_pt,
        page_h_pt,
        font_subsetter,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_single_hocr_word() {
        let h = r#"
<html><body>
<span class='ocrx_word' id='word_1_1' title='bbox 10 20 100 50; x_wconf 95'>Hello</span>
</body></html>"#;
        let words = parse_hocr_word(h);
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].text, "Hello");
        assert_eq!(words[0].bbox, [10, 20, 100, 50]);
        assert_eq!(words[0].confidence, Some(95.0));
    }

    #[test]
    fn parses_multiple_hocr_words() {
        let h = r#"
<span class='ocrx_word' title='bbox 0 0 30 10'>Foo</span>
<span class='ocrx_word' title='bbox 35 0 70 10'>Bar</span>
<span class='ocrx_word' title='bbox 75 0 95 10'>&amp;</span>
"#;
        let words = parse_hocr_word(h);
        assert_eq!(words.len(), 3);
        assert_eq!(words[0].text, "Foo");
        assert_eq!(words[2].text, "&");
        assert_eq!(words[0].confidence, None);
    }

    #[test]
    fn groups_fixture_in_paragraph_line_reading_order() {
        let hocr = include_str!("../../tests/fixtures/ocr/grouped.hocr");
        let words = parse_hocr_word(hocr);
        let text = words_to_plain_text(&words);

        assert_eq!(text, "Hello world\nSecond line\n\nParagraph");
        assert_eq!(
            words
                .iter()
                .map(|word| (word.paragraph_index, word.line_index))
                .collect::<Vec<_>>(),
            vec![(0, 0), (0, 0), (0, 1), (0, 1), (1, 2)]
        );
        assert_eq!(
            words
                .iter()
                .map(|word| word.reading_order)
                .collect::<Vec<_>>(),
            vec![0, 1, 2, 3, 4]
        );
        assert_eq!(average_confidence(&words), Some(87.6));
    }

    #[test]
    fn hocr_cache_roundtrip_retains_word_metadata() {
        let hocr = include_str!("../../tests/fixtures/ocr/grouped.hocr");
        let words = parse_hocr_word(hocr);
        let cached = words_to_hocr(&words);
        assert_eq!(parse_hocr_word(&cached), words);
    }

    #[test]
    fn invisible_stream_contains_bt_tj_et_fallback() {
        let words = vec![HocrWord {
            text: "Hello".into(),
            bbox: [10, 20, 100, 50],
            confidence: Some(95.0),
            paragraph_index: 0,
            line_index: 0,
            reading_order: 0,
        }];
        // Standard 14 fallback path (no subsetter).
        let bytes = build_invisible_text_stream(&words, 1000, 1000, 612.0, 792.0, None);
        let s = String::from_utf8(bytes).unwrap();
        assert!(s.starts_with("BT"));
        assert!(s.contains("3 Tr"));
        assert!(s.contains("(Hello) Tj"));
        assert!(s.contains("ET"));
    }

    struct FixtureTesseractBackend {
        words: Vec<WordBox>,
    }

    impl OcrBackend for FixtureTesseractBackend {
        fn capabilities(&self) -> OcrBackendCapabilities {
            OcrBackendCapabilities {
                id: "tesseract",
                display_name: "Tesseract",
                supported_languages: &["eng", "slk", "ces", "deu", "pol"],
                supports_multi_language: true,
                provides_word_confidence: true,
            }
        }

        fn recognize<'a>(
            &'a self,
            _image: &'a Path,
            _lang: &'a str,
            _opts: &'a OcrRecognitionOptions,
        ) -> OcrBackendFuture<'a> {
            Box::pin(async move { Ok(self.words.clone()) })
        }
    }

    #[tokio::test]
    async fn backend_trait_text_layer_is_deterministic() {
        let backend: Box<dyn OcrBackend> = Box::new(FixtureTesseractBackend {
            words: parse_hocr_word(include_str!("../../tests/fixtures/ocr/grouped.hocr")),
        });
        let options = OcrRecognitionOptions {
            psm: 3,
            oem: 3,
            cancellation: None,
        };
        let first = backend
            .recognize(Path::new("fixture.png"), "eng", &options)
            .await
            .unwrap();
        let second = backend
            .recognize(Path::new("fixture.png"), "eng", &options)
            .await
            .unwrap();
        assert_eq!(
            build_invisible_text_stream(&first, 1000, 1400, 612.0, 792.0, None),
            build_invisible_text_stream(&second, 1000, 1400, 612.0, 792.0, None)
        );
        assert_eq!(backend.capabilities().id, "tesseract");
    }
}
