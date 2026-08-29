//! Phase 18 Task 90i — security assertions.
//!
//! This test guards capability allowlists. Sidecar stderr truncation is tested
//! beside its implementation in `sidecars::manager`.
//!
//! It is runnable without sidecars or fixtures (no `sidecar-tests`
//! gate required) — they only inspect the source-tree configuration and
//! exercise pure-Rust error / argument-handling code paths.

#[test]
fn capability_allowlists_are_restrictive() {
    // Parse src-tauri/capabilities/*.json and verify:
    //   - shell:allow-execute entries pin specific names (no wildcards).
    //   - fs:scope allows only constrained paths.
    use std::path::PathBuf;
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("capabilities");

    let sidecars: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("sidecars.json")).expect("read"))
            .expect("parse sidecars");
    let perms = sidecars["permissions"].as_array().expect("array");
    let mut saw_execute = false;
    for p in perms {
        if p["identifier"] == "shell:allow-execute" {
            saw_execute = true;
            let allow = p["allow"].as_array().expect("allow array");
            for entry in allow {
                let name = entry["name"].as_str().expect("name");
                // No wildcards or paths that resolve outside the bundled
                // sidecar directory.
                assert!(
                    !name.contains('*'),
                    "shell:allow-execute name must not be a wildcard: {name}"
                );
                assert!(
                    name.starts_with("sidecars/"),
                    "shell:allow-execute name must live under sidecars/: {name}"
                );
                // Sidecar flag must be true (forces target-triple resolution).
                assert_eq!(entry["sidecar"], serde_json::Value::Bool(true));
            }
        }
    }
    assert!(saw_execute, "sidecars.json must define shell:allow-execute");

    let default: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("default.json")).expect("read"))
            .expect("parse default");
    let perms = default["permissions"].as_array().expect("array");
    for p in perms {
        if p.is_object() && p["identifier"] == "fs:scope" {
            let allow = p["allow"].as_array().expect("allow array");
            for entry in allow {
                let path = entry["path"].as_str().expect("path");
                // We intentionally allow `**/*.pdf` and `**` (general
                // file-system; user is the gatekeeper via the open
                // dialog). What we DON'T accept is a hard-coded path
                // outside the user's chosen scope. The assertion shape
                // makes a regression to e.g. `C:\Windows\**` loud.
                assert!(
                    !path.contains(":/")
                        && !path.contains(":\\")
                        && !path.starts_with('/')
                        && !path.starts_with('\\'),
                    "fs:scope path must be relative-like (no host root): {path}"
                );
            }
        }
    }
}
