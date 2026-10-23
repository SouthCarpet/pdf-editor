use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Sk,
    #[default]
    En,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub theme: Theme,
    pub language: Language,
    pub default_compress_preset: String,
    pub default_ocr_language: String,
    pub update_check_enabled: bool,
    pub log_level: String,
    pub max_recent_files: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            language: Language::En,
            default_compress_preset: "recommended".into(),
            default_ocr_language: "eng".into(),
            update_check_enabled: false,
            log_level: "info".into(),
            max_recent_files: 20,
        }
    }
}

pub async fn load_settings(path: &Path) -> Result<AppSettings> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let bytes = tokio::fs::read(path)
        .await
        .with_context(|| format!("read {}", path.display()))?;
    let settings: AppSettings = serde_json::from_slice(&bytes).context("parse settings.json")?;
    Ok(settings)
}

pub async fn save_settings(path: &Path, settings: &AppSettings) -> Result<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    let json = serde_json::to_vec_pretty(settings).context("serialize settings")?;
    tokio::fs::write(path, json)
        .await
        .with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

/// Plan 119 removed the "strict privacy" switch: it never blocked a
/// request, and the update consent is the only network control. A stored
/// `privacy_strict: true` turns the consent off once; the key is then
/// dropped, so a later consent change stands. A missing file or a file
/// without the key is left alone; a damaged file is an error and stays as
/// it is.
pub async fn drop_privacy_strict(path: &Path) -> Result<()> {
    let Ok(bytes) = tokio::fs::read(path).await else {
        return Ok(());
    };
    let mut value: serde_json::Value =
        serde_json::from_slice(&bytes).context("parse settings.json")?;
    let Some(object) = value.as_object_mut() else {
        return Ok(());
    };
    let Some(strict) = object.remove("privacy_strict") else {
        return Ok(());
    };
    if strict == serde_json::Value::Bool(true) {
        object.insert("update_check_enabled".into(), false.into());
    }
    let json = serde_json::to_vec_pretty(&value).context("serialize settings")?;
    tokio::fs::write(path, json)
        .await
        .with_context(|| format!("write {}", path.display()))
}

/// The stored update-check consent. A missing file is the default (off); a
/// file that cannot be read or parsed also counts as off, so a broken
/// settings file never lets a request through.
pub async fn update_check_enabled(path: &Path) -> bool {
    if drop_privacy_strict(path).await.is_err() {
        return false;
    }
    load_settings(path)
        .await
        .is_ok_and(|settings| settings.update_check_enabled)
}

/// Stores the update-check consent and keeps every other setting. Fails,
/// and writes nothing, when the existing file cannot be parsed: a damaged
/// file is never overwritten silently.
pub async fn set_update_check_enabled(path: &Path, enabled: bool) -> Result<()> {
    drop_privacy_strict(path).await?;
    let mut settings = load_settings(path).await?;
    settings.update_check_enabled = enabled;
    save_settings(path, &settings).await
}
