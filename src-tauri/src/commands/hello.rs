pub fn say_hello(name: &str) -> String {
    format!("Hello, {name}!")
}

#[tauri::command]
pub fn hello_command(name: String) -> String {
    say_hello(&name)
}
