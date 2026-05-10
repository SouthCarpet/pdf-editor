use pdf_editor_lib::persistence::settings::{load_settings, save_settings, AppSettings, Theme, Language};
use tempfile::TempDir;

#[tokio::test]
async fn settings_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("settings.json");

    let mut settings = AppSettings::default();
    settings.theme = Theme::Dark;
    settings.language = Language::Sk;
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
