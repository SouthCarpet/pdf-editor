// Phase 13 Task 72 — OCR language management commands.
//
// Two endpoints back the OcrLanguagesSettings UI:
//   - list_ocr_languages: enumerate bundled (Phase 1 stage) traineddata
//     files alongside user-added ones in app_data_dir()/tessdata-extra.
//   - add_ocr_language: copy a user-picked .traineddata into the extra
//     dir; subsequent OCR runs pick it up automatically.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::util::paths::tessdata_extra_dir;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn list_ocr_languages(_state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let mut langs: Vec<String> = vec!["eng".into(), "slk".into(), "ces".into(), "deu".into()];
    if let Ok(dir) = tessdata_extra_dir() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.flatten() {
                let path = e.path();
                if path
                    .extension()
                    .map(|x| x == "traineddata")
                    .unwrap_or(false)
                {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        langs.push(stem.to_string());
                    }
                }
            }
        }
    }
    langs.sort();
    langs.dedup();
    Ok(langs)
}

#[tauri::command]
#[specta::specta]
pub async fn add_ocr_language(
    _state: State<'_, AppState>,
    source_path: String,
) -> AppResult<String> {
    let src = PathBuf::from(&source_path);
    if src.extension().map(|s| s != "traineddata").unwrap_or(true) {
        return Err(AppError::InvalidArgument {
            detail: "expected .traineddata file".into(),
        });
    }
    let dir = tessdata_extra_dir().map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    std::fs::create_dir_all(&dir)?;
    let file_name = src.file_name().ok_or_else(|| AppError::InvalidArgument {
        detail: "source path has no filename".into(),
    })?;
    let dst = dir.join(file_name);
    std::fs::copy(&src, &dst)?;
    Ok(dst.display().to_string())
}
