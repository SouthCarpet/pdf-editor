use pdf_editor_lib::sidecars::{manager::SidecarManager, soffice::SofficeWrapper};
use std::path::Path;
use tempfile::TempDir;

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real LibreOffice install + generated fixtures; --features sidecar-tests"
)]
async fn convert_docx_to_pdf() {
    // LibreOffice is bundled via tauri.conf.json bundle.resources (multi-file
    // tree, not externalBin per stage-sidecars.ps1) and is NOT fetched by
    // scripts/fetch-sidecars.ps1. Skip gracefully when the resources tree
    // hasn't been staged yet — meaningful once Phase-9 LibreOffice bundling
    // lands in CI.
    let soffice =
        Path::new("../src-tauri/resources/libreoffice/App/libreoffice/program/soffice.exe");
    let soffice_alt = Path::new("resources/libreoffice/App/libreoffice/program/soffice.exe");
    assert!(
        soffice.exists() || soffice_alt.exists(),
        "LibreOffice is not staged at {} or {}; stage it before running \
         --features sidecar-tests.",
        soffice.display(),
        soffice_alt.display()
    );
    let fixture = Path::new("tests/fixtures/docs/sample.docx");
    assert!(
        fixture.exists(),
        "tests/fixtures/docs/sample.docx missing; generate-fixtures.ps1 only creates it \
         once soffice is staged, so stage LibreOffice and re-run \
         scripts/generate-fixtures.ps1."
    );
    let mgr = SidecarManager::new(2);
    let lo = SofficeWrapper::new(mgr);
    let tmp = TempDir::new().unwrap();
    let out_dir = tmp.path();
    let out = lo
        .convert_to_pdf(fixture, out_dir, None)
        .await
        .expect("convert");
    assert!(out.exists());
    assert!(out.extension().unwrap() == "pdf");
}
