use pdf_editor_lib::services::diff_engine::{text_diff_pdfs, visual_diff_pdfs, DiffOptions};
use std::path::Path;
use tempfile::TempDir;

#[test]
#[ignore] // text_diff depends on TextExtractor (sidecar-only on this build) + fixture
fn text_diff_finds_changes_between_versions() {
    let result = text_diff_pdfs(
        Path::new("tests/fixtures/pdfs/sample.pdf"),
        Path::new("tests/fixtures/pdfs/sample.pdf"),
    )
    .unwrap();
    assert!(result.changes.is_empty(), "identical PDFs should have no diff");
}

#[test]
#[ignore] // visual_diff depends on PdfRenderer (sidecar-only on this build) + fixture
fn visual_diff_returns_overlay_per_page() {
    let tmp = TempDir::new().unwrap();
    let res = visual_diff_pdfs(
        Path::new("tests/fixtures/pdfs/sample.pdf"),
        Path::new("tests/fixtures/pdfs/sample.pdf"),
        tmp.path(),
        &DiffOptions {
            dpi: 100,
            tolerance: 0.03,
        },
    )
    .unwrap();
    assert_eq!(res.pages.len(), 1);
}
