// Phase 9 Task 49 — integration test for the Merge tool's underlying
// service call. Marked `#[ignore]` because it depends on a fixture PDF that
// is not yet bundled in `tests/fixtures/pdfs/sample.pdf`; once that ships
// (Phase 18 smoke fixtures) the test runs on its own.

use pdf_editor_lib::services::pdf_editor::merge_pdfs;
use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::PathBuf;
use tempfile::TempDir;

#[test]
#[ignore = "requires tests/fixtures/pdfs/sample.pdf — pending Phase 18"]
fn merge_two_fixtures() {
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("merged.pdf");
    let a = PathBuf::from("tests/fixtures/pdfs/sample.pdf");
    merge_pdfs(&[a.clone(), a.clone()], &out).unwrap();
    // Save a debug copy outside the TempDir so we can inspect it after a failure.
    let _ = std::fs::copy(&out, std::env::temp_dir().join("merged-probe.pdf"));
    let r = LopdfReader::open(&out).unwrap();
    let got = r.page_count();
    assert!(got >= 2, "expected >=2 pages after merging two copies of sample.pdf, got {got}");
}
