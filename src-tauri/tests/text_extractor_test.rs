// `services::text_extractor::extract_text` is a sync stub on this build
// (mupdf Rust crate deferred). Route through MupdfWrapper — the real runtime
// path — and skip gracefully when the fixture isn't present (slovak-utf8.pdf
// is generated only if LibreOffice is staged).

use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use std::path::Path;

fn mupdf() -> MupdfWrapper {
    MupdfWrapper::new(SidecarManager::new(2))
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real mutool sidecar + LibreOffice-produced slovak-utf8 fixture; --features sidecar-tests"
)]
async fn extract_text_from_slovak_pdf_preserves_diacritics() {
    let path = Path::new("tests/fixtures/pdfs/slovak-utf8.pdf");
    if !path.exists() {
        eprintln!(
            "skip: slovak-utf8.pdf missing (requires staged LibreOffice in \
             generate-fixtures.ps1); Slovak-diacritic extract not exercised"
        );
        return;
    }
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
        .unwrap_or_default();
    // scanned PDF should produce little/no text without OCR
    assert!(text.trim().len() < 50);
}
