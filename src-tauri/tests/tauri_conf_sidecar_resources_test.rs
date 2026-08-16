// Config assertion (plan 036): `sidecars/*.dll` must stay in
// `bundle.resources` of `tauri.conf.json`, or the MSI never ships the
// sidecar DLLs at all and every runtime gate below this one in a dev
// checkout would still pass while the installed build stays broken. No real
// binaries needed, always on (not gated behind `sidecar-tests`).

#[test]
fn sidecar_dlls_are_in_bundle_resources() {
    let raw = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json"),
    )
    .expect("read tauri.conf.json");
    let config: serde_json::Value = serde_json::from_str(&raw).expect("parse tauri.conf.json");

    let resources = config["bundle"]["resources"]
        .as_array()
        .expect("bundle.resources must be an array");

    let has_sidecar_dll_glob = resources
        .iter()
        .any(|entry| entry.as_str() == Some("sidecars/*.dll"));

    assert!(
        has_sidecar_dll_glob,
        "bundle.resources is missing \"sidecars/*.dll\"; without it the MSI never ships \
         qpdf30.dll/libtesseract-5.dll/gsdll64.dll and the installed app cannot start \
         those sidecars regardless of what any runtime test in a dev checkout says. \
         Current bundle.resources: {resources:?}"
    );
}
