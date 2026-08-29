use pdf_editor_lib::services::image_to_pdf::images_to_pdf;
use pdf_editor_lib::services::pdf_reader::{LopdfReader, PdfReader};
use std::path::PathBuf;
use tempfile::TempDir;

#[test]
fn three_images_become_three_page_pdf() {
    let tmp = TempDir::new().unwrap();
    let image = PathBuf::from("tests/fixtures/images/word_test.png");
    assert!(image.exists(), "fixture missing: {}", image.display());
    let imgs = vec![image.clone(), image.clone(), image];
    let out = tmp.path().join("out.pdf");
    images_to_pdf(&imgs, &out, 72.0).unwrap();
    let reader = LopdfReader::open(&out).unwrap();
    assert_eq!(reader.page_count(), 3);
}
