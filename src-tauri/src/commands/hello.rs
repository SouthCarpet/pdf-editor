pub fn say_hello(name: &str) -> String {
    format!("Hello, {name}!")
}

// Phase 7 Task 45 (Delta N MSVC test): try the cleaner pattern with the macros
// applied directly in the lib. `main.rs` no longer needs the wrapper —
// `pdf_editor_lib::specta_builder()` collects this command and the runtime
// uses `builder.invoke_handler()`.
#[tauri::command]
#[specta::specta]
pub fn hello_command(name: String) -> String {
    say_hello(&name)
}
