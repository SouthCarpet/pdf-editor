use pdf_editor_lib::sidecars::{
    ghostscript::CompressionPreset, ghostscript::GhostscriptWrapper, manager::SidecarManager,
    mupdf::MupdfWrapper,
};
use std::path::Path;
use tempfile::TempDir;

const SAMPLE: &str = "tests/fixtures/pdfs/sample.pdf";

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real ghostscript binary + generated fixtures; --features sidecar-tests"
)]
async fn ghostscript_compresses_with_preset() {
    let mgr = SidecarManager::new(2);
    let gs = GhostscriptWrapper::new(mgr);
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("c.pdf");
    gs.compress(
        Path::new(SAMPLE),
        &out,
        CompressionPreset::Recommended,
        None,
    )
    .await
    .expect("compress");
    assert!(out.exists());
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real mutool binary + generated fixtures; --features sidecar-tests"
)]
async fn mupdf_clean_subsets_fonts() {
    let mgr = SidecarManager::new(2);
    let m = MupdfWrapper::new(mgr);
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("clean.pdf");
    m.clean_subset_fonts(Path::new(SAMPLE), &out, None)
        .await
        .expect("clean");
    assert!(out.exists());
}
