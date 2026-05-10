use pdf_editor_lib::services::pdf_editor::{merge_pdfs, split_pdf};
use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::PathBuf;
use tempfile::TempDir;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from("tests/fixtures/pdfs").join(name)
}

#[test]
#[ignore] // requires fixture; run scripts/generate-fixtures.ps1 first
fn merge_two_pdfs_sums_pages() {
    let tmp = TempDir::new().unwrap();
    let a = fixture("sample.pdf");
    let pa = LopdfReader::open(&a).unwrap().page_count();
    let out = tmp.path().join("merged.pdf");
    merge_pdfs(&[a.clone(), a.clone()], &out).unwrap();
    let merged = LopdfReader::open(&out).unwrap();
    assert_eq!(merged.page_count(), pa * 2);
}

#[test]
#[ignore] // requires fixture; run scripts/generate-fixtures.ps1 first
fn split_into_individual_pages() {
    let tmp = TempDir::new().unwrap();
    let a = fixture("sample.pdf");
    let outs = split_pdf(&a, &[1..=1], tmp.path()).unwrap();
    assert!(!outs.is_empty());
    for p in &outs {
        assert_eq!(LopdfReader::open(p).unwrap().page_count(), 1);
    }
}
