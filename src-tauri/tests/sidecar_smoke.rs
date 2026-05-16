use pdf_editor_lib::sidecars::smoke::run_qpdf_version;

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real qpdf sidecar; run scripts/fetch-sidecars.ps1 + stage-sidecars.ps1 first, then --features sidecar-tests"
)]
async fn qpdf_version_prints_v12() {
    let out = run_qpdf_version().await.expect("sidecar should succeed");
    // qpdf prints `<exe-basename> version X.Y.Z`; with Tauri externalBin the
    // basename is `qpdf-x86_64-pc-windows-msvc`, so match `version 12.` mid-line.
    assert!(out.contains("version 12."), "unexpected: {out}");
}
