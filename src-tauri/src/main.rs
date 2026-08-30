#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pdf_editor_lib::app_state::AppState;
use pdf_editor_lib::commands::startup::{pdf_paths_from_args, OPEN_PATHS_EVENT};
use pdf_editor_lib::persistence::db::{create_pool, run_migrations};
use pdf_editor_lib::specta_builder;
use pdf_editor_lib::util::{
    crash_logger::{install_panic_hook, install_unhandled_exception_filter, TraceRing},
    logging::init_logging,
    paths::{db_path, logs_dir},
};
use tauri::{Emitter, Manager};

#[tokio::main]
async fn main() {
    // Resolve logs_dir once up-front. If it fails we still try to limp on
    // with a `logs/` fallback so the panic hook has somewhere to write.
    let logs = logs_dir().unwrap_or_else(|e| {
        eprintln!("WARN: failed to resolve logs dir: {e:#}; falling back to ./logs");
        std::path::PathBuf::from("logs")
    });

    // Delta P: the ring buffer must exist before init_logging so the
    // RingLayer can be installed alongside the file/stdout layers, and
    // before install_panic_hook so the panic hook captures the same ring.
    let ring = TraceRing::new();

    let _guard = match init_logging(&logs, "info", ring.clone()) {
        Ok(g) => Some(g),
        Err(e) => {
            eprintln!("WARN: failed to init logs: {e:#}");
            None
        }
    };

    // Delta P: install crash hooks BEFORE Tauri builder. The panic hook
    // chains the previous hook (set by Rust's std machinery); the SEH
    // filter is a no-op on non-Windows.
    install_panic_hook(logs.clone(), ring.clone());
    install_unhandled_exception_filter(logs.clone());

    // Delta G: init the rayon thread pool process-wide, leaving one core for
    // the Tauri/UI thread. `build_global` can only succeed once per process,
    // so we ignore failure (e.g. a test harness that already initialized it).
    rayon::ThreadPoolBuilder::new()
        .num_threads(num_cpus::get().saturating_sub(1).max(1))
        .build_global()
        .ok();

    let pool = create_pool(&db_path().expect("resolve db path"))
        .await
        .expect("open sqlite pool");
    run_migrations(&pool).await.expect("run db migrations");
    let state = AppState::new(pool);

    let builder = specta_builder();

    // In dev, regenerate the TS bindings on every launch so they stay in sync.
    #[cfg(debug_assertions)]
    {
        let out = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/bindings.ts");
        let _ = builder.export(specta_typescript::Typescript::default(), out);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = pdf_paths_from_args(args, std::path::Path::new(&cwd));
            if !paths.is_empty() {
                let _ = app.emit_to("main", OPEN_PATHS_EVENT, paths);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    drop(_guard);
}
