use std::process::Command;

fn git_output(args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn emit_build_commit() {
    let commit = git_output(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".to_owned());
    let dirty = git_output(&["status", "--porcelain"])
        .map(|status| !status.is_empty())
        .unwrap_or(false);

    println!("cargo:rustc-env=PDF_EDITOR_BUILD_COMMIT={commit}");
    println!("cargo:rustc-env=PDF_EDITOR_BUILD_DIRTY={dirty}");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=../.git/index");

    if let Some(head_ref) = git_output(&["symbolic-ref", "-q", "HEAD"])
        .and_then(|git_ref| git_output(&["rev-parse", "--git-path", &git_ref]))
    {
        println!("cargo:rerun-if-changed={head_ref}");
    }
}

fn main() {
    emit_build_commit();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        cc::Build::new()
            .file("native/rapidocr_ort.c")
            .include("resources/ocr/include")
            .warnings(true)
            .compile("rapidocr_ort");
        println!("cargo:rerun-if-changed=native/rapidocr_ort.c");
        println!("cargo:rerun-if-changed=resources/ocr/include/onnxruntime_c_api.h");
    }
    // No AppManifest command list here, on purpose. Listing ANY app command
    // puts EVERY app command under the ACL: only the listed ones get
    // permissions, and the rest fail at runtime with "not allowed by ACL"
    // (check_for_update and open_document broke this way on 2026-08-30).
    // App commands are this app's own code and stay allowed by default;
    // capabilities/default.json grants plugin and window permissions only.
    tauri_build::build()
}
