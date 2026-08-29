use pdf_editor_lib::services::pdf_editor::{merge_pdfs, split_pdf};
use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::PathBuf;
use tempfile::TempDir;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from("tests/fixtures/pdfs").join(name)
}

#[test]
fn merge_two_pdfs_sums_pages() {
    let tmp = TempDir::new().unwrap();
    let a = fixture("sample.pdf");
    let out = tmp.path().join("merged.pdf");
    merge_pdfs(&[a.clone(), a.clone()], &out).unwrap();
    let merged = LopdfReader::open(&out).unwrap();
    // Oracle: generate-fixtures.ps1 defines sample.pdf as one page.
    assert_eq!(merged.page_count(), 2);
}

#[test]
fn split_into_individual_pages() {
    let tmp = TempDir::new().unwrap();
    let a = fixture("sample.pdf");
    let outs = split_pdf(&a, &[1..=1], tmp.path()).unwrap();
    assert_eq!(outs.len(), 1);
    assert_eq!(LopdfReader::open(&outs[0]).unwrap().page_count(), 1);
}
