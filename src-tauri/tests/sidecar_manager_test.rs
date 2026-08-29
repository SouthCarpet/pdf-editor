use pdf_editor_lib::error::AppError;
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
    // qpdf prints `<exe-basename> version X.Y.Z`; with Tauri's externalBin
    // the basename is `qpdf-x86_64-pc-windows-msvc`, so match the version
    // substring instead of a strict `qpdf version` prefix.
    assert!(String::from_utf8_lossy(&out.stdout).contains("version 12."));
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real pdfcrack binary; --features sidecar-tests"
)]
async fn timeout_kills_process() {
    let mgr = SidecarManager::new(4);
    // A brute-force attack over this charset/length range takes far longer
    // than the 100ms timeout, and the fixture's real password is not in the
    // search space, so pdfcrack is still working when the manager's timeout
    // fires and must kill it.
    let spec = SidecarRunSpec {
        name: "pdfcrack".into(),
        args: vec![
            "-f".into(),
            "tests/fixtures/pdfs/password-open.pdf".into(),
            "-c".into(),
            "abcdefghijklmnopqrstuvwxyz0123456789".into(),
            "-n".into(),
            "6".into(),
            "-m".into(),
            "8".into(),
        ],
        stdin: None,
        timeout: Some(Duration::from_millis(100)),
        cancellation: None,
    };
    let result = mgr.run(spec).await;

    match result.expect_err("brute-force search space must outlast the 100ms timeout") {
        AppError::SidecarFailed {
            tool,
            exit_code,
            stderr_tail,
        } => {
            assert_eq!(tool, "pdfcrack");
            assert_eq!(exit_code, -2);
            assert_eq!(stderr_tail, "timeout");
        }
        other => panic!("expected a timeout SidecarFailed error, got: {other:?}"),
    }
}

#[tokio::test]
async fn sidecar_manager_resolves_path() {
    let mgr = SidecarManager::new(4);
    let path = mgr.resolve_binary("qpdf");
    let s = path.to_string_lossy();
    // We at least find a candidate path string with one of the suffixes
    assert!(s.contains("qpdf"), "got: {s}");
}
