// Delta W §required-test — OCR text editable like native text.
//
// This test exercises the full Phase 12 + 13 + Delta W stack:
//   1. Run OCR on a scanned-only fixture (Slovak language) — Delta W
//      guarantees the OCR layer uses a Type0 CIDFont subset.
//   2. extract_runs on the output — at least one run must be returned
//      (Phase 12 Task 68: enumerate /Tj /TJ operators).
//   3. replace_run on a run — Slovak diacritics like "Editované" must
//      round-trip through the Identity-H encoding path without
//      EncodingMismatch (would fail with the legacy Helvetica/WinAnsi
//      OCR layer — Delta W is precisely about closing that gap).
//   4. extract_runs again — "Editované" present with full diacritics.
//
// Gated behind `#[ignore]` because it needs:
//   - real Tesseract sidecar binary
//   - real mutool sidecar binary
//   - a scanned PDF fixture with Slovak text
//   - the Slovak tessdata pack
//
// CI/local runners materialize these via `scripts/fetch-sidecars.ps1`
// + `scripts/generate-fixtures.ps1` (see Delta L); the test currently
// only exists to keep the API surface compiling, but is structurally
// complete so a future run does no extra plumbing.

use pdf_editor_lib::commands::ocr::inject_text_layers;
use pdf_editor_lib::services::ocr_engine::{OcrOptions, OcrOutputMode};
use pdf_editor_lib::services::text_edit::{extract_runs, replace_run};
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use pdf_editor_lib::sidecars::tesseract::TesseractWrapper;
use std::path::PathBuf;
use tempfile::TempDir;

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real Tesseract + mutool sidecars + Slovak fixture; --features sidecar-tests"
)]
async fn ocr_then_edit_preserves_diacritics() {
    let tmp = TempDir::new().unwrap();
    let scanned = PathBuf::from("tests/fixtures/pdfs/scanned.pdf");
    let ocred = tmp.path().join("ocred.pdf");
    let edited = tmp.path().join("edited.pdf");

    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr.clone());
    let tess = TesseractWrapper::new(mgr.clone());

    // 1. Run OCR (Slovak).
    let opts = OcrOptions {
        engine: Default::default(),
        language: "slk".into(),
        dpi: 300,
        psm: 3,
        oem: 3,
        output: OcrOutputMode::SearchablePdf,
        deskew: true,
        despeckle: false,
        preserve_raster: true,
    };
    let doc_pages = {
        let d = lopdf::Document::load(&scanned).unwrap();
        d.get_pages().len() as u32
    };
    let mut hocrs: Vec<(u32, String, u32, u32)> = Vec::new();
    for i in 0..doc_pages {
        let raster = tmp.path().join(format!("p-{i}.png"));
        mupdf
            .render_page_to_png(&scanned, i, &raster, opts.dpi, None)
            .await
            .unwrap();
        let dim = {
            use std::io::Read;
            let mut f = std::fs::File::open(&raster).unwrap();
            let mut buf = [0u8; 24];
            f.read_exact(&mut buf).unwrap();
            (
                u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]),
                u32::from_be_bytes([buf[20], buf[21], buf[22], buf[23]]),
            )
        };
        let h = tess
            .ocr_image_with_hocr(&raster, &opts.language, None)
            .await
            .unwrap();
        hocrs.push((i, h, dim.0, dim.1));
    }
    inject_text_layers(&scanned, &ocred, &opts, &hocrs).expect("inject");

    // 2. extract_runs on the OCR'd output.
    let runs = extract_runs(&ocred).expect("runs");
    assert!(
        !runs.is_empty(),
        "extract_runs returned no runs; tests/fixtures/pdfs/scanned.pdf looks like the \
         placeholder 16x16 synthetic PNG (no actual text) rather than a real scanned-Slovak \
         fixture. Regenerate it with real content via scripts/generate-fixtures.ps1 before \
         running --features sidecar-tests."
    );
    let first = &runs[0];

    // 3. replace_run with Slovak diacritics. The Type0 CIDFont (Delta W)
    //    must accept "Editované" without EncodingMismatch.
    replace_run(
        &ocred,
        &edited,
        first.page,
        first.operator_index,
        "Editované",
    )
    .expect("replace_run");

    // 4. extract_runs again — "Editované" must round-trip.
    let runs2 = extract_runs(&edited).expect("runs2");
    let joined: String = runs2
        .iter()
        .map(|r| r.text.clone())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(
        joined.contains("Editované"),
        "diacritics must round-trip via the Type0 CIDFont layer (joined: {joined})"
    );
}
