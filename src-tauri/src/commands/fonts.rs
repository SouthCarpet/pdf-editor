// Delta U — list_fonts_cmd. Returns the cached list of Standard 14 +
// system fonts.  First call populates the cache via
// `services::fonts::list_system_fonts` on a blocking thread (DirectWrite
// enumeration can take ~100ms on Windows).
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::services::fonts::{list_system_fonts, SystemFont};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn list_fonts_cmd(state: State<'_, AppState>) -> AppResult<Vec<SystemFont>> {
    let cache = state.fonts.clone();
    let result = cache
        .get_or_try_init(|| async {
            tokio::task::spawn_blocking(list_system_fonts)
                .await
                .map_err(|e| AppError::Internal {
                    detail: e.to_string(),
                })
        })
        .await?;
    Ok(result.clone())
}
