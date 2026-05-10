use specta_typescript::Typescript;
use std::path::PathBuf;

fn main() {
    // Resolve the output path relative to this crate's manifest directory so
    // the generator works whether `cargo run` is invoked from the workspace
    // root (via `pnpm gen:bindings`) or from inside `src-tauri/`.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let out = manifest_dir
        .parent()
        .expect("manifest dir has parent")
        .join("src")
        .join("bindings.ts");

    pdf_editor_lib::specta_builder()
        .export(Typescript::default(), &out)
        .expect("failed to export TS bindings");
    println!("wrote {}", out.display());
}
