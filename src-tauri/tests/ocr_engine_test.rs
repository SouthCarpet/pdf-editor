use pdf_editor_lib::services::ocr_engine::{ocr_pdf_add_text_layer, OcrOptions, OcrOutputMode};
use pdf_editor_lib::services::text_extractor::extract_text;
use std::path::Path;
use tempfile::TempDir;

#[test]
#[ignore] // sidecar-only on this build; needs Tesseract + mutool sidecars + fixture
fn ocr_makes_scanned_pdf_searchable() {
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("ocred.pdf");
    ocr_pdf_add_text_layer(
        Path::new("tests/fixtures/pdfs/scanned.pdf"),
        &out,
        &OcrOptions {
            language: "eng".into(),
            dpi: 300,
            psm: 3,
            oem: 3,
            output: OcrOutputMode::SearchablePdf,
            deskew: true,
            despeckle: false,
            preserve_raster: true,
        },
    )
    .unwrap();
    let text = extract_text(&out).unwrap();
    assert!(
        text.trim().len() > 10,
        "OCR text should be present after layer added"
    );
}
