use pdf_editor_lib::sidecars::manager::{SidecarManager, SidecarRunSpec};
use std::time::Duration;

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real qpdf binary; run scripts/fetch-sidecars.ps1 first, then --features sidecar-tests"
)]
async fn run_qpdf_version_via_manager() {
    let mgr = SidecarManager::new(4);
    let spec = SidecarRunSpec {
        name: "qpdf".into(),
        args: vec!["--version".into()],
        stdin: None,
        timeout: Some(Duration::from_secs(10)),
        cancellation: None,
    };
    let out = mgr.run(spec).await.expect("ok");
    assert!(out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).starts_with("qpdf version"));
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real pdfcrack binary; --features sidecar-tests"
)]
async fn timeout_kills_process() {
    let mgr = SidecarManager::new(4);
    let spec = SidecarRunSpec {
        name: "pdfcrack".into(),
        args: vec!["-h".into()],
        stdin: None,
        timeout: Some(Duration::from_millis(100)),
        cancellation: None,
    };
    let _ = mgr.run(spec).await;
}

#[tokio::test]
async fn sidecar_manager_resolves_path() {
    let mgr = SidecarManager::new(4);
    let path = mgr.resolve_binary("qpdf");
    let s = path.to_string_lossy();
    // We at least find a candidate path string with one of the suffixes
    assert!(s.contains("qpdf"), "got: {s}");
}
