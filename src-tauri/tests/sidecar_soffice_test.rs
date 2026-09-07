// Plan 067 W2 — this whole test binary is compiled only with
// `--features libreoffice-tests`.
//
// `#[cfg_attr(not(feature = ...), ignore = "...")]`, the gate every other
// sidecar test here uses, is not enough for this one: the `sidecar-contract`
// job runs `cargo test --features sidecar-tests -- --include-ignored`, and
// `--include-ignored` runs ignored tests as well, so an ignore attribute
// cannot keep a test out of the job. Only `cfg` can, by leaving the test out
// of the binary.
//
// And LibreOffice is never there to test against: it is absent from
// `scripts/sidecar-manifest.json`, `scripts/fetch-sidecars.ps1` does not
// download it, and `scripts/stage-sidecars.ps1:26,57` states that it is not
// staged with the five externalBin sidecars — it ships as a bundled resource
// tree via `tauri.conf.json`. Run this with
// `cargo test --manifest-path src-tauri/Cargo.toml --features libreoffice-tests`
// once that tree is staged under
// `src-tauri/resources/libreoffice/App/libreoffice/program/`.
#![cfg(feature = "libreoffice-tests")]

use pdf_editor_lib::sidecars::{manager::SidecarManager, soffice::SofficeWrapper};
use std::path::Path;
use tempfile::TempDir;

#[tokio::test]
async fn convert_docx_to_pdf() {
    let soffice =
        Path::new("../src-tauri/resources/libreoffice/App/libreoffice/program/soffice.exe");
    let soffice_alt = Path::new("resources/libreoffice/App/libreoffice/program/soffice.exe");
    assert!(
        soffice.exists() || soffice_alt.exists(),
        "LibreOffice is not staged at {} or {}; stage the bundled tree before running \
         --features libreoffice-tests. scripts/fetch-sidecars.ps1 and \
         scripts/stage-sidecars.ps1 do not provide it.",
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
