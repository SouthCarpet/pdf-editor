use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::Path;

#[test]
#[ignore] // requires fixture; run scripts/generate-fixtures.ps1 first
fn page_count_matches_fixture() {
    let r = LopdfReader::open(Path::new("tests/fixtures/pdfs/sample.pdf")).unwrap();
    assert!(r.page_count() >= 1);
}

#[test]
#[ignore] // requires fixture; run scripts/generate-fixtures.ps1 first
fn metadata_returns_optional_fields() {
    let r = LopdfReader::open(Path::new("tests/fixtures/pdfs/sample.pdf")).unwrap();
    let meta = r.metadata();
    let _ = (meta.title, meta.author, meta.creator); // simply accessible
}
