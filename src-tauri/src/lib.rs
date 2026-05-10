// Library entry point for pdf_editor_lib.
pub mod commands;
pub mod error;
pub mod persistence;
pub mod services;
pub mod sidecars;
pub mod util;

pub mod app_state;

/// Build the specta Builder used by both the binding generator and the runtime.
///
/// Phase 6 starts with no commands wired here — Phase 7+ tasks add command lib
/// fns to the `commands::*` modules and append them to this `collect_commands!`.
///
/// TODO (Phase 9): TEST DELTA N ON MSVC. The mingw GNU toolchain crashed
/// integration tests when `#[tauri::command]` lived inside the lib (Delta N).
/// On MSVC link.exe this should now be safe — when Phase 9 wires the first real
/// command into this builder, run the full test suite to confirm.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![])
}
