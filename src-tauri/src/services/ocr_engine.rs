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

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

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

/// Sidecar-only placeholder; the real entrypoint lives in
/// `commands::ocr::ocr_pdf_cmd` which composes MupdfWrapper +
/// TesseractWrapper + this module's `build_text_layer_from_hocr`.
pub fn ocr_pdf_add_text_layer(_input: &Path, _output: &Path, _opts: &OcrOptions) -> Result<()> {
    Err(anyhow!(
        "ocr_pdf_add_text_layer is sidecar-only on this build; use commands::ocr::ocr_pdf_cmd"
    ))
}

/// Parsed hOCR word: text and its bounding box in pixel coordinates
/// (relative to the rasterized page that tesseract saw).
#[derive(Debug, Clone)]
pub struct HocrWord {
    pub text: String,
    pub bbox: [i32; 4],
}

/// Pull every `ocrx_word` span out of a tesseract hOCR document. We do a
/// minimal regex-free parse: scan for the `bbox` token and the inner
/// text, ignoring confidence and other attributes.
pub fn parse_hocr_word(hocr: &str) -> Vec<HocrWord> {
    let mut out = Vec::new();
    let mut rest = hocr;
    while let Some(pos) = rest.find("class='ocrx_word'") {
        // Look back for the start of the span tag.
        let span_start = rest[..pos].rfind("<span").unwrap_or(0);
        // Look forward for the closing > of the opening tag.
        let after_tag = match rest[pos..].find('>') {
            Some(p) => pos + p + 1,
            None => break,
        };
        // Read the text until the matching </span>.
        let text_end = match rest[after_tag..].find("</span>") {
            Some(p) => after_tag + p,
            None => break,
        };
        let text = rest[after_tag..text_end].trim().to_string();
        // Find the bbox attribute inside the opening tag.
        let tag = &rest[span_start..after_tag];
        let bbox = parse_bbox(tag);
        if let Some(b) = bbox {
            if !text.is_empty() {
                out.push(HocrWord {
                    text: html_unescape(&text),
                    bbox: b,
                });
            }
        }
        rest = &rest[text_end + "</span>".len()..];
    }
    out
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

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
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
        for w in words {
            sub.add_text(&w.text);
        }
        for w in words {
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
        for w in words {
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
    }

    #[test]
    fn invisible_stream_contains_bt_tj_et_fallback() {
        let words = vec![HocrWord {
            text: "Hello".into(),
            bbox: [10, 20, 100, 50],
        }];
        // Standard 14 fallback path (no subsetter).
        let bytes = build_invisible_text_stream(&words, 1000, 1000, 612.0, 792.0, None);
        let s = String::from_utf8(bytes).unwrap();
        assert!(s.starts_with("BT"));
        assert!(s.contains("3 Tr"));
        assert!(s.contains("(Hello) Tj"));
        assert!(s.contains("ET"));
    }
}
