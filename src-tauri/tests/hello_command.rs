use pdf_editor_lib::commands::hello::say_hello;

#[test]
fn say_hello_returns_greeting() {
    assert_eq!(say_hello("World"), "Hello, World!");
}
