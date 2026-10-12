// Library entry point for pdf_editor_lib.
pub mod commands;
pub mod error;
pub mod persistence;
pub mod pipeline;
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
            commands::update::build_info,
            commands::update::check_for_update,
            commands::update::download_update,
            commands::update::install_update,
            commands::update::get_update_check_enabled,
            commands::update::set_update_check_enabled,
            // Phase 9 — Form-style tools (Tasks 49-56)
            commands::merge::merge_pdfs_cmd,
            commands::split::split_pdf_cmd,
            commands::extract::extract_pages_cmd,
            commands::compress::compress_pdf_cmd,
            commands::optimize::optimize_pdf_cmd,
            commands::optimize::estimate_optimize_cmd,
            commands::unlock::detect_pdf_encryption,
            commands::unlock::unlock_pdf_cmd,
            commands::convert_export::convert_pdf_export_cmd,
            commands::convert_import::convert_to_pdf_cmd,
            // Phase 10 — Workspace shell (Tasks 57-58)
            commands::workspace::open_document,
            commands::workspace::save_document,
            commands::render::render_page_thumbnail,
            commands::detect_form_fields::detect_scanned_form_fields_cmd,
            // Phase 11 — Workspace tools (Tasks 62-65)
            commands::crop::crop_pdf_cmd,
            commands::organize::rotate_pages_cmd,
            commands::organize::delete_pages_cmd,
            commands::organize::reorder_pages_cmd,
            commands::organize::insert_blank_page_cmd,
            commands::compare::compare_visual_cmd,
            commands::compare::compare_text_cmd,
            // Phase 12 Task 66 — Edit Tier 1 (AcroForm fill)
            commands::edit_forms::read_form_fields_cmd,
            commands::edit_forms::set_form_values_cmd,
            // Delta U (typography baseline) — system font enumeration
            commands::fonts::list_fonts_cmd,
            // Phase 12 Task 67 — Edit Tier 2 (annotations)
            commands::edit_annotations::apply_annotations_cmd,
            // Phase 12 Task 68 — Edit Tier 3 (real inline text edit)
            commands::edit_text::extract_runs_cmd,
            commands::edit_text::replace_run_cmd,
            commands::edit_text::replace_run_redaction_cmd,
            // Phase 12 Task 69 — Autosave
            commands::autosave::autosave_put,
            commands::autosave::autosave_get,
            commands::autosave::autosave_delete,
            // Phase 13 Task 70 — OCR
            commands::ocr::ocr_pdf_cmd,
            commands::ocr::detect_scanned_pdf,
            commands::ocr::list_ocr_backends,
            commands::ocr_edit::list_ocr_page_words_cmd,
            commands::ocr_edit::edit_ocr_page_words_cmd,
            // Phase 13 Task 72 — OCR language management
            commands::tessdata::list_ocr_languages,
            commands::tessdata::add_ocr_language,
            // Phase 14 Task 76 — Pipeline preset CRUD
            commands::pipeline_presets::pipeline_preset_create,
            commands::pipeline_presets::pipeline_preset_list,
            commands::pipeline_presets::pipeline_preset_get,
            commands::pipeline_presets::pipeline_preset_update,
            commands::pipeline_presets::pipeline_preset_delete,
            // Phase 14 Task 77 — Pipeline run (single + folder)
            commands::pipeline_run::pipeline_run_cmd,
            commands::pipeline_run::pipeline_run_on_folder_cmd,
            // Phase 15 Task 78 — Projects (CRUD + files + attached pipelines)
            commands::projects::project_create,
            commands::projects::project_list,
            commands::projects::project_get,
            commands::projects::project_update,
            commands::projects::project_delete,
            commands::projects::project_add_file,
            commands::projects::project_remove_file,
            commands::projects::project_list_files,
            commands::projects::project_add_pipeline,
            commands::projects::project_remove_pipeline,
            commands::projects::project_list_pipelines,
            // Phase 15 Task 80 — Project import / export.
            commands::project_io::project_export,
            commands::project_io::project_import,
            // Phase 16 Task 81 — Recovery wizard (Dict + Brute; Mask Unimplemented).
            commands::recovery::recovery_attempt,
            // Phase 17 Task 87 — Last session restore.
            commands::session::session_save,
            commands::session::session_list,
            commands::session::session_clear,
            // Plan 062 T6.1 - reusable transparent PNG signature library.
            commands::signatures::signature_list,
            commands::signatures::signature_import,
            commands::signatures::signature_create_from_png_bytes,
            commands::signatures::signature_rename,
            commands::signatures::signature_delete,
            // Plan 062 T4.1 - Explorer and command-line PDF arguments.
            commands::startup::startup_paths,
        ])
}
