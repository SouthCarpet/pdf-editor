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
/// Phase 7 Task 45 wires the first batch of commands here. With the MSVC
/// toolchain, `#[tauri::command]` inside the lib should no longer crash
/// integration tests (Delta N) — when that's confirmed, future phases can
/// keep adding commands here without the main.rs wrapper dance.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        // Tauri serializes commands via JSON, where JS numbers can represent
        // integers up to 2^53. Our i64 page counts / sizes / limits all fit
        // well below that — opt out of the BigInt restriction so the bindings
        // type them as plain `number` instead of refusing to compile.
        .dangerously_cast_bigints_to_number()
        .commands(tauri_specta::collect_commands![
            commands::hello::hello_command,
            commands::meta::recent_files_list,
            commands::meta::recent_files_remove,
            commands::meta::cancel_job,
            // Delta P (crash & error logging)
            commands::meta::record_frontend_error,
            commands::meta::open_logs_folder,
            // Phase 9 — Form-style tools (Tasks 49-56)
            commands::merge::merge_pdfs_cmd,
            commands::split::split_pdf_cmd,
            commands::extract::extract_pages_cmd,
            commands::compress::compress_pdf_cmd,
            commands::optimize::optimize_pdf_cmd,
            commands::unlock::detect_pdf_encryption,
            commands::unlock::unlock_pdf_cmd,
            commands::convert_export::convert_pdf_export_cmd,
            commands::convert_import::convert_to_pdf_cmd,
            // Phase 10 — Workspace shell (Tasks 57-58)
            commands::workspace::open_document,
            commands::workspace::save_document,
            commands::render::render_page_thumbnail,
            // Phase 11 — Workspace tools (Tasks 62-65)
            commands::crop::crop_pdf_cmd,
            commands::organize::rotate_pages_cmd,
            commands::organize::delete_pages_cmd,
            commands::organize::reorder_pages_cmd,
            commands::organize::insert_blank_page_cmd,
        ])
}
