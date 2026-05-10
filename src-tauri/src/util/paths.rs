use anyhow::{Context, Result};
use directories::ProjectDirs;
use std::path::PathBuf;

pub fn app_data_dir() -> Result<PathBuf> {
    let dirs = ProjectDirs::from("com", "PdfEditor", "PdfEditor")
        .context("could not determine project dirs")?;
    let dir = dirs.data_dir().to_path_buf();
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    Ok(dir)
}

pub fn settings_path() -> Result<PathBuf> { Ok(app_data_dir()?.join("settings.json")) }
pub fn db_path()       -> Result<PathBuf> { Ok(app_data_dir()?.join("app.db")) }
pub fn logs_dir()      -> Result<PathBuf> { Ok(app_data_dir()?.join("logs")) }
pub fn pipeline_presets_dir() -> Result<PathBuf> { Ok(app_data_dir()?.join("pipeline-presets")) }
pub fn projects_dir()  -> Result<PathBuf> { Ok(app_data_dir()?.join("projects")) }
pub fn tessdata_extra_dir() -> Result<PathBuf> { Ok(app_data_dir()?.join("tessdata-extra")) }
