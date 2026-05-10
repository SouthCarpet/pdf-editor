use pdf_editor_lib::services::text_extractor::extract_text;
use std::path::Path;

#[test]
#[ignore] // sidecar-only on this build; needs mutool sidecar + fixture
fn extract_text_from_slovak_pdf_preserves_diacritics() {
    let text = extract_text(Path::new("tests/fixtures/pdfs/slovak-utf8.pdf")).unwrap();
    assert!(
        text.contains('č') || text.contains('š') || text.contains('á'),
        "expected Slovak diacritics, got: {}",
        text
    );
}

#[test]
#[ignore] // sidecar-only on this build; needs mutool sidecar + fixture
fn extract_text_returns_empty_for_scanned_pdf() {
    let text = extract_text(Path::new("tests/fixtures/pdfs/scanned.pdf")).unwrap_or_default();
    // scanned PDF should produce little/no text without OCR
    assert!(text.trim().len() < 50);
}
