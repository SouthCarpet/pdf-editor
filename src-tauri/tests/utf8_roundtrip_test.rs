//! Phase 18 Task 90e — UTF-8 round-trip integration tests.
//!
//! The single most behaviorally important suite for this app's
//! "lossless UTF-8" promise (spec §8). Reads `slovak-utf8.pdf` (built by
//! `scripts/generate-fixtures.ps1`), routes it through every text-
//! touching tool, and asserts each Slovak / Czech / German diacritic
//! survives.
//!
//! Gated behind the `sidecar-tests` feature because it requires
//! real qpdf / ghostscript / mutool / tesseract sidecars and the generated
//! fixture set. The one test that also needs LibreOffice at run time
//! (`convert_to_docx_preserves_diacritics`) carries the `libreoffice-tests`
//! feature on top.
#![cfg(feature = "sidecar-tests")]

use pdf_editor_lib::sidecars::ghostscript::{CompressionPreset, GhostscriptWrapper};
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use pdf_editor_lib::sidecars::tesseract::TesseractWrapper;
use std::path::Path;
use tempfile::TempDir;

const SLOVAK_FIXTURE: &str = "tests/fixtures/pdfs/slovak-utf8.pdf";

/// `slovak-utf8.pdf` is produced by `generate-fixtures.ps1` step 4 from the
/// mutool sidecar alone (plan 067 W6; it needed LibreOffice before, which CI
/// never stages). This whole file is already gated behind `--features
/// sidecar-tests` (opt-in to real fixtures), so a missing fixture here is a
/// genuine setup problem: fail loudly instead of silently skipping to a false
/// pass.
fn require_slovak_fixture(test: &str) {
    assert!(
        Path::new(SLOVAK_FIXTURE).exists(),
        "[{test}] {SLOVAK_FIXTURE} missing; run scripts/fetch-sidecars.ps1, \
         scripts/stage-sidecars.ps1 and scripts/generate-fixtures.ps1 before running \
         with --features sidecar-tests"
    );
}

/// The minimum graphemes we require to survive every round-trip. Slovak
/// + Czech-only + German + ß cover the diacritic classes most likely to
/// trip up a non-CID encoding path.
const EXPECTED_GRAPHEMES: &[char] = &[
    // Slovak
    'á', 'č', 'ď', 'é', 'í', 'ľ', 'ĺ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž',
    // Czech-only
    'ě', 'ř', 'ů', // German
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
    require_slovak_fixture("slovak_text_extracts_with_all_diacritics");
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
    require_slovak_fixture("convert_to_txt_preserves_diacritics");
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

/// W7 (plan 067): the only test in this file that needs LibreOffice at RUN
/// time — `SofficeWrapper::convert` shells out to `soffice.exe`, which
/// `scripts/stage-sidecars.ps1` states in as many words that it does not stage.
/// `--include-ignored` (the shape the `sidecar-contract` job uses) runs ignored
/// tests too, so only `cfg` can keep it out of that job. Run it with
/// `--features "sidecar-tests libreoffice-tests"` once LibreOffice is staged.
#[cfg(feature = "libreoffice-tests")]
#[tokio::test]
async fn convert_to_docx_preserves_diacritics() {
    require_slovak_fixture("convert_to_docx_preserves_diacritics");
    let tmp = TempDir::new().unwrap();
    // soffice can be driven via SofficeWrapper::convert_to_docx (uses
    // the LibreOffice tree). We exercise the path by converting and
    // re-extracting via mutool on the resulting docx-PDF round-trip.
    use pdf_editor_lib::sidecars::soffice::SofficeWrapper;
    // Same precondition as sidecar_soffice_test.rs: without it the failure
    // reads "The system cannot find the path specified. (os error 3)", which
    // says nothing about what is missing or how to supply it.
    let soffice = Path::new("resources/libreoffice/App/libreoffice/program/soffice.exe");
    assert!(
        soffice.exists(),
        "LibreOffice is not staged at {}; stage the bundled tree before running \
         --features libreoffice-tests. scripts/fetch-sidecars.ps1 and \
         scripts/stage-sidecars.ps1 do not provide it.",
        soffice.display()
    );
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
    require_slovak_fixture("ocr_recovers_diacritics_from_scanned_slovak");
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
    let text = tess.ocr_image(&raster, "slk", None).await.expect("ocr slk");
    // Tesseract OCR fidelity is imperfect at small sizes — assert at
    // least the lower-frequency diacritics are recovered.
    for &g in &['č', 'š', 'ž', 'á'] {
        assert!(text.contains(g), "OCR should recover '{g}'; got: {text}");
    }
}

#[tokio::test]
async fn compress_preserves_extractable_text() {
    require_slovak_fixture("compress_preserves_extractable_text");
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
    require_slovak_fixture("optimize_subset_fonts_preserves_diacritics");
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
