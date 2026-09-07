// `services::text_extractor::extract_text` is a sync stub on this build
// (mupdf Rust crate deferred). Route through MupdfWrapper — the real runtime
// path. `slovak-utf8.pdf` comes from `scripts/generate-fixtures.ps1` step 4,
// which since plan 067 W6 needs only the mutool sidecar.

use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use std::path::Path;

fn mupdf() -> MupdfWrapper {
    MupdfWrapper::new(SidecarManager::new(2))
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real mutool sidecar + the generated slovak-utf8 fixture; --features sidecar-tests"
)]
async fn extract_text_from_slovak_pdf_preserves_diacritics() {
    let path = Path::new("tests/fixtures/pdfs/slovak-utf8.pdf");
    assert!(
        path.exists(),
        "tests/fixtures/pdfs/slovak-utf8.pdf missing; run scripts/fetch-sidecars.ps1, \
         scripts/stage-sidecars.ps1 and scripts/generate-fixtures.ps1 before running \
         --features sidecar-tests."
    );
    let text = mupdf().extract_text(path).await.unwrap();
    assert!(
        text.contains('č') || text.contains('š') || text.contains('á'),
        "expected Slovak diacritics, got: {}",
        text
    );
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real mutool sidecar + fixture; --features sidecar-tests"
)]
async fn extract_text_returns_empty_for_scanned_pdf() {
    let text = mupdf()
        .extract_text(Path::new("tests/fixtures/pdfs/scanned.pdf"))
        .await
        .expect("extract scanned PDF text");
    // scanned PDF should produce little/no text without OCR
    assert!(text.trim().len() < 50);
}
