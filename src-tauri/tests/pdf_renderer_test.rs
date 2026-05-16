use pdf_editor_lib::sidecars::manager::SidecarManager;
use pdf_editor_lib::sidecars::mupdf::MupdfWrapper;
use std::path::Path;
use tempfile::TempDir;

// `services::pdf_renderer::render_page_to_png` is a sync stub on this build
// (mupdf Rust crate deferred — use mutool sidecar). Test the same surface
// through MupdfWrapper, which is what runtime code uses.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "needs real mutool sidecar + fixture; --features sidecar-tests"
)]
async fn render_first_page_to_png() {
    let tmp = TempDir::new().unwrap();
    let png = tmp.path().join("p1.png");
    let mgr = SidecarManager::new(2);
    let mupdf = MupdfWrapper::new(mgr);
    mupdf
        .render_page_to_png(
            Path::new("tests/fixtures/pdfs/sample.pdf"),
            0,
            &png,
            150,
            None,
        )
        .await
        .unwrap();
    let bytes = std::fs::read(&png).unwrap();
    assert!(
        bytes.len() > 100,
        "rendered PNG too small: {} bytes",
        bytes.len()
    );
    assert_eq!(&bytes[0..4], b"\x89PNG");
}
