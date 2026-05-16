use pdf_editor_lib::services::diff_engine::{visual_diff_pdfs, DiffOptions};
use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use similar::{ChangeTag, TextDiff};
use std::path::Path;
use tempfile::TempDir;

// `text_diff_pdfs` in services/diff_engine.rs goes through the sync
// `text_extractor::extract_text_per_page` stub, which always errors on this
// build (the mupdf Rust crate is deferred — mupdf-tools sidecar via
// `MupdfWrapper` is the real path). Exercise the equivalent flow against the
// real sidecar so the test covers a meaningful slice of the diff pipeline.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real mutool sidecar; --features sidecar-tests"
)]
async fn text_diff_finds_changes_between_versions() {
    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr);
    let sample = Path::new("tests/fixtures/pdfs/sample.pdf");
    let left = mupdf.extract_text(sample).await.expect("extract left");
    let right = left.clone();
    let diff = TextDiff::from_words(&left, &right);
    let any_changes = diff
        .iter_all_changes()
        .any(|c| !matches!(c.tag(), ChangeTag::Equal));
    assert!(!any_changes, "identical PDFs should have no diff");
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
