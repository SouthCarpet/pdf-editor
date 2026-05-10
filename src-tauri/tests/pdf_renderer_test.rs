use pdf_editor_lib::services::pdf_renderer::{render_page_to_png, RenderOptions};
use std::path::Path;
use tempfile::TempDir;

#[test]
#[ignore] // sidecar-only on this build; needs fixture + mutool sidecar
fn render_first_page_to_png() {
    let tmp = TempDir::new().unwrap();
    let png = tmp.path().join("p1.png");
    render_page_to_png(
        Path::new("tests/fixtures/pdfs/sample.pdf"),
        0,
        &png,
        &RenderOptions { dpi: 150 },
    )
    .unwrap();
    let bytes = std::fs::read(&png).unwrap();
    assert!(bytes.len() > 1000);
    assert_eq!(&bytes[0..4], b"\x89PNG");
}
