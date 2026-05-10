#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pdf_editor_lib::util::{logging::init_logging, paths::logs_dir};

// Tauri-bound wrapper for the lib's `hello_command`. Reason: keeping the
// `#[tauri::command]` macro out of `pdf_editor_lib` prevents `tauri::Wry`
// runtime symbols from being pulled into integration tests that link the
// lib. On the host's mingw-w64 GNU toolchain that link path produces test
// executables that fail to start with STATUS_ENTRYPOINT_NOT_FOUND.
//
// TODO (Phase 9): TEST DELTA N ON MSVC. With link.exe this should be safe;
// when the first real command moves into the lib, this wrapper can fold away.
#[tauri::command]
fn hello_command(name: String) -> String {
    pdf_editor_lib::commands::hello::hello_command(name)
}

fn main() {
    let _guard = match logs_dir().and_then(|d| init_logging(&d, "info")) {
        Ok(g) => Some(g),
        Err(e) => {
            eprintln!("WARN: failed to init logs: {e:#}");
            None
        }
    };

    // Delta G: init the rayon thread pool process-wide, leaving one core for
    // the Tauri/UI thread. `build_global` can only succeed once per process,
    // so we ignore failure (e.g. a test harness that already initialized it).
    rayon::ThreadPoolBuilder::new()
        .num_threads(num_cpus::get().saturating_sub(1).max(1))
        .build_global()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![hello_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    drop(_guard);
}
