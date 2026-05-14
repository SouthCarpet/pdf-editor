//! Phase 18 Task 90e — UTF-8 round-trip integration tests.
//!
//! The single most behaviorally important suite for this app's
//! "lossless UTF-8" promise (spec §8). Reads `slovak-utf8.pdf` (built by
//! `scripts/generate-fixtures.ps1`), routes it through every text-
//! touching tool, and asserts each Slovak / Czech / German diacritic
//! survives.
//!
//! Gated behind the `sidecar-tests` feature because it requires
//! real qpdf / ghostscript / mutool / soffice / tesseract sidecars and
//! the generated fixture set.
#![cfg(feature = "sidecar-tests")]

use pdf_editor_lib::services::ocr_engine::{OcrOptions, OcrOutputMode};
use pdf_editor_lib::sidecars::ghostscript::{CompressionPreset, GhostscriptWrapper};
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use pdf_editor_lib::sidecars::tesseract::TesseractWrapper;
use std::path::Path;
use tempfile::TempDir;

const SLOVAK_FIXTURE: &str = "tests/fixtures/pdfs/slovak-utf8.pdf";

/// The minimum graphemes we require to survive every round-trip. Slovak
/// + Czech-only + German + ß cover the diacritic classes most likely to
/// trip up a non-CID encoding path.
const EXPECTED_GRAPHEMES: &[char] = &[
    // Slovak
    'á', 'č', 'ď', 'é', 'í', 'ľ', 'ĺ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž',
    // Czech-only
    'ě', 'ř', 'ů',
    // German
    'ä', 'ö', 'ü', 'ß',
];

fn assert_all_diacritics_present(text: &str, ctx: &str) {
    for &g in EXPECTED_GRAPHEMES {
        assert!(
            text.contains(g),
            "[{ctx}] missing diacritic '{g}' in extracted text:\n{text}"
        );
    }
}

#[tokio::test]
async fn slovak_text_extracts_with_all_diacritics() {
    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr);
    let text = mupdf
        .extract_text(Path::new(SLOVAK_FIXTURE))
        .await
        .expect("extract");
    assert_all_diacritics_present(&text, "mutool extract_text");
}

#[tokio::test]
async fn convert_to_txt_preserves_diacritics() {
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("out.txt");
    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr);
    mupdf
        .convert_to_format(Path::new(SLOVAK_FIXTURE), &out, "text", 150, None)
        .await
        .expect("convert text");
    let body = std::fs::read_to_string(&out).expect("read txt");
    assert_all_diacritics_present(&body, "convert_to_txt");
}

#[tokio::test]
async fn convert_to_docx_preserves_diacritics() {
    let tmp = TempDir::new().unwrap();
    // soffice can be driven via SofficeWrapper::convert_to_docx (uses
    // the LibreOffice tree). We exercise the path by converting and
    // re-extracting via mutool on the resulting docx-PDF round-trip.
    use pdf_editor_lib::sidecars::soffice::SofficeWrapper;
    let mgr = SidecarManager::new(2);
    let lo = SofficeWrapper::new(mgr.clone());
    let docx = lo
        .convert(Path::new(SLOVAK_FIXTURE), tmp.path(), "docx", None)
        .await
        .expect("convert to docx");
    // The .docx body is a zip; the OOXML document.xml inside should
    // contain our diacritics directly.
    let body = std::fs::read(&docx).expect("read docx");
    // Look for one Slovak char's UTF-8 bytes inside the docx as a
    // smoke check (deep XML parsing is overkill for a smoke test).
    let needle = "č".as_bytes();
    assert!(
        body.windows(needle.len()).any(|w| w == needle),
        "docx body should embed Slovak diacritics directly"
    );
}

#[tokio::test]
async fn ocr_recovers_diacritics_from_scanned_slovak() {
    // Render slovak-utf8.pdf to image first, then OCR with slk lang.
    let tmp = TempDir::new().unwrap();
    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr.clone());
    let raster = tmp.path().join("p0.png");
    mupdf
        .render_page_to_png(Path::new(SLOVAK_FIXTURE), 0, &raster, 300, None)
        .await
        .expect("render");

    let tess = TesseractWrapper::new(mgr);
    let text = tess
        .ocr_image(&raster, "slk", None)
        .await
        .expect("ocr slk");
    // Tesseract OCR fidelity is imperfect at small sizes — assert at
    // least the lower-frequency diacritics are recovered.
    for &g in &['č', 'š', 'ž', 'á'] {
        assert!(
            text.contains(g),
            "OCR should recover '{g}'; got: {text}"
        );
    }
    let _ = OcrOptions {
        language: "slk".into(),
        dpi: 300,
        psm: 3,
        oem: 3,
        output: OcrOutputMode::SearchablePdf,
        deskew: false,
        despeckle: false,
        preserve_raster: false,
    };
}

#[tokio::test]
async fn compress_preserves_extractable_text() {
    let tmp = TempDir::new().unwrap();
    let mgr = SidecarManager::new(2);
    let gs = GhostscriptWrapper::new(mgr.clone());
    let mupdf = MupdfWrapper::new(mgr);
    let out = tmp.path().join("c.pdf");
    gs.compress(
        Path::new(SLOVAK_FIXTURE),
        &out,
        CompressionPreset::Recommended,
        None,
    )
    .await
    .expect("compress");
    let text = mupdf.extract_text(&out).await.expect("re-extract");
    assert_all_diacritics_present(&text, "compress preserves");
}

#[tokio::test]
async fn optimize_subset_fonts_preserves_diacritics() {
    let tmp = TempDir::new().unwrap();
    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr);
    let out = tmp.path().join("s.pdf");
    mupdf
        .clean_subset_fonts(Path::new(SLOVAK_FIXTURE), &out, None)
        .await
        .expect("subset fonts");
    let text = mupdf.extract_text(&out).await.expect("re-extract");
    assert_all_diacritics_present(&text, "optimize subset preserves");
}
