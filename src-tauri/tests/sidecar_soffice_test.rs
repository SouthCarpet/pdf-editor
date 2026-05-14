use pdf_editor_lib::sidecars::{manager::SidecarManager, soffice::SofficeWrapper};
use std::path::Path;
use tempfile::TempDir;

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real LibreOffice install + generated fixtures; --features sidecar-tests"
)]
async fn convert_docx_to_pdf() {
    let mgr = SidecarManager::new(2);
    let lo = SofficeWrapper::new(mgr);
    let tmp = TempDir::new().unwrap();
    let out_dir = tmp.path();
    let out = lo
        .convert_to_pdf(
            Path::new("tests/fixtures/docs/sample.docx"),
            out_dir,
            None,
        )
        .await
        .expect("convert");
    assert!(out.exists());
    assert!(out.extension().unwrap() == "pdf");
}
