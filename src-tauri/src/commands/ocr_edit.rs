use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::persistence::ocr_cache;
use crate::services::ocr_edit::{self, OcrPageWords};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct EditOcrWordsArgs {
    pub input: String,
    pub output: String,
    pub page_index: u32,
    pub word_ids: Vec<u32>,
    pub replacement: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct EditOcrWordsResult {
    pub output_path: String,
    pub removed_word_ids: Vec<u32>,
    pub skipped_word_ids: Vec<u32>,
    pub cache_invalidated: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn list_ocr_page_words_cmd(path: String, page_index: u32) -> AppResult<OcrPageWords> {
    tokio::task::spawn_blocking(move || {
        ocr_edit::list_page_words(&PathBuf::from(path), page_index).map_err(|error| {
            AppError::Internal {
                detail: format!("{error:#}"),
            }
        })
    })
    .await
    .map_err(|error| AppError::Internal {
        detail: error.to_string(),
    })?
}

#[tauri::command]
#[specta::specta]
pub async fn edit_ocr_page_words_cmd(
    state: State<'_, AppState>,
    args: EditOcrWordsArgs,
) -> AppResult<EditOcrWordsResult> {
    let input = PathBuf::from(&args.input);
    let output = PathBuf::from(&args.output);
    let output_path = args.output.clone();
    let page_index = args.page_index;
    let word_ids = args.word_ids;
    let replacement = args.replacement;
    let mutation = tokio::task::spawn_blocking(move || {
        ocr_edit::mutate_page_words(
            &input,
            &output,
            page_index,
            &word_ids,
            replacement.as_deref(),
        )
        .map_err(|error| AppError::Internal {
            detail: format!("{error:#}"),
        })
    })
    .await
    .map_err(|error| AppError::Internal {
        detail: error.to_string(),
    })??;

    let cache_invalidated = match mutation.cache_key {
        Some(key) => ocr_cache::invalidate(&state.pool, &key)
            .await
            .map_err(|error| AppError::Internal {
                detail: format!("OCR edit saved, but cache invalidation failed: {error:#}"),
            })?,
        None => false,
    };
    Ok(EditOcrWordsResult {
        output_path,
        removed_word_ids: mutation.removed_word_ids,
        skipped_word_ids: mutation.skipped_word_ids,
        cache_invalidated,
    })
}
