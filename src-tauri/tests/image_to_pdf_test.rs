use pdf_editor_lib::services::image_to_pdf::images_to_pdf;
use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::PathBuf;
use tempfile::TempDir;

#[test]
#[ignore] // requires fixture; run scripts/generate-fixtures.ps1 first
fn three_images_become_three_page_pdf() {
    let tmp = TempDir::new().unwrap();
    let imgs = ["a.png", "b.jpg", "c.png"]
        .into_iter()
        .map(|n| PathBuf::from("tests/fixtures/images").join(n))
        .filter(|p| p.exists())
        .collect::<Vec<_>>();
    if imgs.len() < 3 {
        return;
    }
    let out = tmp.path().join("out.pdf");
    images_to_pdf(&imgs, &out, 72.0).unwrap();
    let reader = LopdfReader::open(&out).unwrap();
    assert_eq!(reader.page_count(), 3);
}
