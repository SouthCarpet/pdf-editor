// Phase 9 Task 49 — integration test for the Merge tool's underlying
// service call against the bundled one-page fixture.

use pdf_editor_lib::services::pdf_editor::merge_pdfs;
use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::PathBuf;
use tempfile::TempDir;

#[test]
fn merge_two_fixtures() {
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("merged.pdf");
    let a = PathBuf::from("tests/fixtures/pdfs/sample.pdf");
    merge_pdfs(&[a.clone(), a.clone()], &out).unwrap();
    let r = LopdfReader::open(&out).unwrap();
    assert_eq!(r.page_count(), 2, "two one-page inputs make two pages");
}
