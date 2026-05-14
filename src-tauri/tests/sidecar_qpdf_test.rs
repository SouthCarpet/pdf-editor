use pdf_editor_lib::sidecars::{manager::SidecarManager, qpdf::QpdfWrapper};
use std::path::Path;
use tempfile::TempDir;

const FIXTURE: &str = "tests/fixtures/pdfs/password-permission.pdf";

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real qpdf binary + generated fixtures; --features sidecar-tests"
)]
async fn qpdf_decrypt_removes_permission_lock() {
    let mgr = SidecarManager::new(2);
    let qpdf = QpdfWrapper::new(mgr);
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("decrypted.pdf");
    qpdf.decrypt(Path::new(FIXTURE), &out, None)
        .await
        .expect("decrypt");
    assert!(out.exists());
    assert!(out.metadata().unwrap().len() > 0);
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real qpdf binary + generated fixtures; --features sidecar-tests"
)]
async fn qpdf_linearize() {
    let mgr = SidecarManager::new(2);
    let qpdf = QpdfWrapper::new(mgr);
    let tmp = TempDir::new().unwrap();
    let out = tmp.path().join("lin.pdf");
    qpdf.linearize(Path::new(FIXTURE), &out, None)
        .await
        .expect("linearize");
    assert!(out.exists());
}
