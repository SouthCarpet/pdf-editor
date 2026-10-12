//! The Inno setup and the app find installs with the same constants
//! (docs/install-contract.md). These tests fail when they drift apart.
use pdf_editor_lib::util::install_detect::{packed_guid, INNO_APP_ID, MSI_UPGRADE_CODE};
use std::path::Path;

fn repo_file(relative: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(relative);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

#[test]
fn setup_app_id_matches_the_detection_constant() {
    let iss = repo_file("packaging/pdf-editor.iss");

    assert!(
        iss.contains(r#"#define AppIdGuid "77A403B7-BE43-4976-BB7B-4C0CE4E8D7CA""#),
        "pdf-editor.iss AppIdGuid differs from INNO_APP_ID"
    );
    assert_eq!(INNO_APP_ID, "{77A403B7-BE43-4976-BB7B-4C0CE4E8D7CA}");
}

#[test]
fn setup_looks_up_the_same_packed_msi_upgrade_code() {
    let iss = repo_file("packaging/pdf-editor.iss");
    let packed = packed_guid(MSI_UPGRADE_CODE).expect("MSI_UPGRADE_CODE is a GUID");

    assert!(
        iss.contains(&format!("MsiUpgradeCodePacked = '{packed}';")),
        "pdf-editor.iss MsiUpgradeCodePacked differs from packed MSI_UPGRADE_CODE {packed}"
    );
}

#[test]
fn msi_upgrade_code_matches_tauri_conf() {
    let conf: serde_json::Value =
        serde_json::from_str(&repo_file("src-tauri/tauri.conf.json")).expect("tauri.conf.json");
    let configured = conf["bundle"]["windows"]["wix"]["upgradeCode"]
        .as_str()
        .expect("bundle.windows.wix.upgradeCode");

    assert_eq!(
        format!("{{{}}}", configured.to_ascii_uppercase()),
        MSI_UPGRADE_CODE
    );
}
