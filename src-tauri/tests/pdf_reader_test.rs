use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::Path;

#[test]
fn page_count_matches_fixture() {
    let r = LopdfReader::open(Path::new("tests/fixtures/pdfs/sample.pdf")).unwrap();
    assert_eq!(r.page_count(), 1);
}

#[test]
fn metadata_is_empty_when_the_pdf_has_no_info_dictionary() {
    let r = LopdfReader::open(Path::new("tests/fixtures/pdfs/sample.pdf")).unwrap();
    let meta = r.metadata();
    // Oracle: `mutool show sample.pdf trailer` has no /Info entry.
    assert_eq!(meta.title, None);
    assert_eq!(meta.author, None);
    assert_eq!(meta.subject, None);
    assert_eq!(meta.keywords, None);
    assert_eq!(meta.creator, None);
    assert_eq!(meta.producer, None);
}
