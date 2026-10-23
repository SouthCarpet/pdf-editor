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

mod libreoffice {
    use super::repo_file;
    use pdf_editor_lib::util::install_detect::{
        Hive, LIBREOFFICE_DOWNLOAD_URL, LIBREOFFICE_KEYS, LIBREOFFICE_WINGET_ID, SOFFICE_EXE,
    };

    #[test]
    fn setup_reads_the_same_registry_keys_as_the_app() {
        let iss = repo_file("packaging/pdf-editor.iss");

        for (hive, key) in LIBREOFFICE_KEYS {
            let root = match hive {
                Hive::LocalMachine => "HKLM64",
                Hive::CurrentUser => "HKCU",
            };
            let call = format!("LibreOfficeUnder({root}, '{key}')");
            assert!(iss.contains(&call), "pdf-editor.iss lacks {call}");
        }
        assert_eq!(
            iss.matches("LibreOfficeUnder(HK").count(),
            LIBREOFFICE_KEYS.len()
        );
        assert!(iss.contains(&format!("SofficeExe = '{SOFFICE_EXE}';")));
    }

    #[test]
    fn setup_offers_the_same_download_page_and_winget_package() {
        let iss = repo_file("packaging/pdf-editor.iss");

        assert!(iss.contains(&format!(
            "LibreOfficeDownloadUrl = '{LIBREOFFICE_DOWNLOAD_URL}';"
        )));
        assert!(iss.contains(&format!(
            "LibreOfficeWingetArgs = 'install --id {LIBREOFFICE_WINGET_ID} -e \
             --accept-package-agreements --accept-source-agreements';"
        )));
    }

    #[test]
    fn setup_never_opens_the_page_through_a_command_shell() {
        let iss = repo_file("packaging/pdf-editor.iss").to_ascii_lowercase();

        assert!(!iss.contains("{cmd}"));
        assert!(!iss.contains("cmd.exe"));
        assert!(iss.contains("shellexec('open', libreofficedownloadurl"));
    }

    #[test]
    fn silent_setup_and_no_answer_never_install_libreoffice() {
        let iss = repo_file("packaging/pdf-editor.iss");
        let offer = iss
            .split("procedure OfferLibreOffice();")
            .nth(1)
            .expect("OfferLibreOffice in pdf-editor.iss");
        let silent = offer.find("if WizardSilent then").expect("silent guard");
        let ask = offer
            .find("MB_YESNO or MB_DEFBUTTON2, IDNO) <> IDYES then")
            .expect("question with default No");
        let install = offer
            .find("InstallLibreOfficeWithWinget(Winget)")
            .expect("winget call");

        assert!(silent < ask && ask < install);
    }
}

mod uninstall {
    use super::repo_file;
    use pdf_editor_lib::util::uninstall_data::{
        EXIT_REFUSED, FLAG, PART_APP_DATA, PART_SIGNATURES, SIGNATURES_DIR, TAURI_IDENTIFIER,
    };

    #[test]
    fn uninstaller_passes_the_flag_and_parts_the_app_reads() {
        let iss = repo_file("packaging/pdf-editor.iss");

        assert!(iss.contains(&format!("RemoveDataFlag = '{FLAG}';")));
        assert!(iss.contains(&format!("RemoveDataRefusedCode = {EXIT_REFUSED};")));
        assert!(iss.contains(&format!("RemoveAppDataPart = ' {PART_APP_DATA}';")));
        assert!(iss.contains(&format!("RemoveSignaturesPart = ' {PART_SIGNATURES}';")));
        assert!(iss.contains(&format!(
            r"{{userappdata}}\{TAURI_IDENTIFIER}\{SIGNATURES_DIR}"
        )));
    }

    #[test]
    fn silent_uninstall_exits_before_any_question() {
        let iss = repo_file("packaging/pdf-editor.iss");
        let step = iss
            .split("procedure CurUninstallStepChanged")
            .nth(1)
            .expect("CurUninstallStepChanged in pdf-editor.iss");
        let silent = step.find("if UninstallSilent then").expect("silent guard");
        let ask = step.find("UninstallDataParts()").expect("questions");

        assert!(silent < ask);
    }

    #[test]
    fn both_questions_default_to_no() {
        let iss = repo_file("packaging/pdf-editor.iss");
        let parts = iss
            .split("function UninstallDataParts(): String;")
            .nth(1)
            .and_then(|rest| rest.split("\nend;").next())
            .expect("UninstallDataParts in pdf-editor.iss");

        assert_eq!(parts.matches("MB_YESNO or MB_DEFBUTTON2").count(), 2);
    }

    #[test]
    fn tauri_identifier_matches_tauri_conf() {
        let conf: serde_json::Value =
            serde_json::from_str(&repo_file("src-tauri/tauri.conf.json")).unwrap();

        assert_eq!(conf["identifier"], TAURI_IDENTIFIER);
    }
}
