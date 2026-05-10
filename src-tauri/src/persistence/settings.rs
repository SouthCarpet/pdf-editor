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
    pub privacy_strict: bool,
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
            privacy_strict: true,
        }
    }
}

pub async fn load_settings(path: &Path) -> Result<AppSettings> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let bytes = tokio::fs::read(path).await.with_context(|| format!("read {}", path.display()))?;
    let settings: AppSettings = serde_json::from_slice(&bytes).context("parse settings.json")?;
    Ok(settings)
}

pub async fn save_settings(path: &Path, settings: &AppSettings) -> Result<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    let json = serde_json::to_vec_pretty(settings).context("serialize settings")?;
    tokio::fs::write(path, json).await.with_context(|| format!("write {}", path.display()))?;
    Ok(())
}
