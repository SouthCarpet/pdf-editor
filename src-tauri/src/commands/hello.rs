pub fn say_hello(name: &str) -> String {
    format!("Hello, {name}!")
}

pub fn hello_command(name: String) -> String {
    say_hello(&name)
}
