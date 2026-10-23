use pdf_editor_lib::persistence::settings::{
    load_settings, save_settings, AppSettings, Language, Theme,
};
use tempfile::TempDir;

#[tokio::test]
async fn settings_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("settings.json");

    let settings = AppSettings {
        theme: Theme::Dark,
        language: Language::Sk,
        ..AppSettings::default()
    };
    save_settings(&path, &settings).await.expect("save");

    let loaded = load_settings(&path).await.expect("load");
    assert_eq!(loaded.theme, Theme::Dark);
    assert_eq!(loaded.language, Language::Sk);
}

#[tokio::test]
async fn settings_load_returns_default_when_missing() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("missing.json");
    let loaded = load_settings(&path).await.expect("default");
    assert_eq!(loaded.theme, Theme::System);
}

mod update_consent {
    use pdf_editor_lib::persistence::settings::{
        load_settings, save_settings, set_update_check_enabled, update_check_enabled, AppSettings,
        Theme,
    };
    use tempfile::TempDir;

    #[tokio::test]
    async fn consent_is_off_when_no_settings_file_exists() {
        let tmp = TempDir::new().unwrap();

        assert!(!update_check_enabled(&tmp.path().join("settings.json")).await);
    }

    #[tokio::test]
    async fn turning_consent_on_keeps_the_other_settings() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        let dark = AppSettings {
            theme: Theme::Dark,
            ..AppSettings::default()
        };
        save_settings(&path, &dark).await.unwrap();

        set_update_check_enabled(&path, true)
            .await
            .expect("store consent");

        assert!(update_check_enabled(&path).await);
        assert_eq!(load_settings(&path).await.unwrap().theme, Theme::Dark);
    }

    #[tokio::test]
    async fn a_damaged_settings_file_reads_as_off_and_is_not_overwritten() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, b"{ not json").unwrap();

        let stored = set_update_check_enabled(&path, true).await;

        assert!(stored.is_err());
        assert!(!update_check_enabled(&path).await);
        assert_eq!(std::fs::read(&path).unwrap(), b"{ not json");
    }

    fn stored_json(path: &std::path::Path) -> serde_json::Value {
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
    }

    #[tokio::test]
    async fn stored_privacy_strict_true_turns_consent_off_once_and_is_dropped() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(
            &path,
            br#"{ "theme": "dark", "update_check_enabled": true, "privacy_strict": true }"#,
        )
        .unwrap();

        assert!(!update_check_enabled(&path).await);
        let stored = stored_json(&path);
        assert_eq!(stored.get("privacy_strict"), None);
        assert_eq!(stored["theme"], "dark");

        set_update_check_enabled(&path, true).await.unwrap();

        assert!(update_check_enabled(&path).await, "the migration runs once");
    }

    #[tokio::test]
    async fn stored_privacy_strict_false_is_dropped_and_keeps_the_consent() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(
            &path,
            br#"{ "update_check_enabled": true, "privacy_strict": false }"#,
        )
        .unwrap();

        assert!(update_check_enabled(&path).await);
        assert_eq!(stored_json(&path).get("privacy_strict"), None);
    }

    #[tokio::test]
    async fn setting_the_consent_drops_privacy_strict_before_it_writes() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, br#"{ "privacy_strict": true }"#).unwrap();

        set_update_check_enabled(&path, true).await.unwrap();

        assert!(update_check_enabled(&path).await);
        assert_eq!(stored_json(&path).get("privacy_strict"), None);
    }

    #[tokio::test]
    async fn new_settings_files_have_no_privacy_strict_key() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("settings.json");

        save_settings(&path, &AppSettings::default()).await.unwrap();

        assert_eq!(stored_json(&path).get("privacy_strict"), None);
    }

    #[tokio::test]
    async fn a_write_error_is_returned_not_swallowed() {
        let tmp = TempDir::new().unwrap();
        let blocker = tmp.path().join("not-a-dir");
        std::fs::write(&blocker, b"file").unwrap();

        let stored = set_update_check_enabled(&blocker.join("settings.json"), true).await;

        assert!(stored.is_err(), "writing under a file path must fail");
    }
}
