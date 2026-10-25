// Plan 036 gate: every sidecar must launch THROUGH `SidecarManager`, from the
// same layout the built app ships (`target/{debug,release}`: unsuffixed exe,
// no DLLs colocated), with a scrubbed PATH so the developer machine's PATH
// cannot mask a delivery defect. See
// `.vault/process/plans/plan_v1_sidecar_dlls.md`
// (gate-phase verification contract) for the requirements this encodes.
//
// `resolve_binary`'s first branch resolves `current_exe().parent().join("{name}.exe")`.
// Under `cargo test`, `current_exe()` is the test binary itself, which lives in
// `target/debug/deps/`, not `target/debug/`. Left alone, that branch misses and
// falls through to the `CARGO_MANIFEST_DIR/sidecars/` branch, which resolves
// straight into `src-tauri/sidecars/` where every DLL already sits next to the
// exe, so the delivery bug would never reproduce. This test copies the real
// unsuffixed exe that Tauri's build script already stages into `target/debug/`
// into the test binary's own directory, with no DLL alongside, so
// `resolve_binary`'s untouched first branch resolves to the same "exe alone, no
// DLL" shape the shipped layout has.

use pdf_editor_lib::sidecars::manager::{SidecarManager, SidecarRunSpec};
use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

/// (sidecar name, args to run, substring the successful output must contain,
/// which stream carries it). Measured directly (`src-tauri/sidecars/`, clean
/// PATH, piped stdout+stderr separately) rather than assumed: qpdf, tesseract,
/// pdfcrack and the gswin64c startup banner all write their version text to
/// stdout, but `mutool -v` writes it to **stderr** with an empty stdout. A
/// gate that only ever checked stdout would false-negative on mutool.
const SIDECARS: &[(&str, &[&str], &str, Stream)] = &[
    ("qpdf", &["--version"], "version", Stream::Stdout),
    ("gswin64c", &["--version"], "10.", Stream::Stdout),
    ("mutool", &["-v"], "mutool version", Stream::Stderr),
    ("tesseract", &["--version"], "tesseract v5", Stream::Stdout),
    (
        "pdfcrack",
        &["--version"],
        "pdfcrack version",
        Stream::Stdout,
    ),
];

#[derive(Clone, Copy)]
enum Stream {
    Stdout,
    Stderr,
}

/// Stages the target-layout defect shape (unsuffixed exe, no DLL) next to the
/// running test binary, and scrubs `PATH` for the process. Restores both on
/// drop, including on test panic, so a failing assertion still leaves the
/// filesystem and environment clean for the next run.
struct TargetLayoutFixture {
    copied: Vec<PathBuf>,
    original_path: Option<OsString>,
}

impl TargetLayoutFixture {
    fn stage(names: &[&str]) -> Self {
        let exe = std::env::current_exe().expect("current_exe");
        let deps_dir = exe.parent().expect("test binary has a parent dir");
        let target_debug = deps_dir
            .parent()
            .expect("deps dir has a parent (target/debug)");

        let mut copied = Vec::new();
        for name in names {
            let src = target_debug.join(format!("{name}.exe"));
            assert!(
                src.exists(),
                "expected the un-suffixed staged exe at {} (built by tauri_build::build() \
                 on every `cargo build`/`cargo test`); run `cargo build --manifest-path \
                 src-tauri/Cargo.toml` first",
                src.display()
            );
            let dst = deps_dir.join(format!("{name}.exe"));
            std::fs::copy(&src, &dst).unwrap_or_else(|e| {
                panic!(
                    "copy {} -> {} for target-layout fixture: {e}",
                    src.display(),
                    dst.display()
                )
            });
            copied.push(dst);
        }

        let original_path = std::env::var_os("PATH");
        // SAFETY: this test file has exactly one test function; no other
        // thread in this process mutates or reads PATH concurrently with it.
        unsafe {
            std::env::set_var("PATH", "C:\\Windows\\System32;C:\\Windows");
        }

        Self {
            copied,
            original_path,
        }
    }
}

impl Drop for TargetLayoutFixture {
    fn drop(&mut self) {
        for p in &self.copied {
            let _ = std::fs::remove_file(p);
        }
        // SAFETY: see stage(); single-threaded use within this test file.
        unsafe {
            match &self.original_path {
                Some(v) => std::env::set_var("PATH", v),
                None => std::env::remove_var("PATH"),
            }
        }
    }
}

#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real sidecar binaries; run scripts/fetch-sidecars.ps1 + \
              stage-sidecars.ps1 + `cargo build` first, then --features sidecar-tests"
)]
async fn all_five_sidecars_launch_through_manager_from_target_layout() {
    let names: Vec<&str> = SIDECARS.iter().map(|(n, _, _, _)| *n).collect();
    let _fixture = TargetLayoutFixture::stage(&names);

    let mgr = SidecarManager::new(4);
    let mut failures: Vec<String> = Vec::new();

    for (name, args, expected_token, stream) in SIDECARS {
        let spec = SidecarRunSpec {
            name: (*name).into(),
            args: args.iter().map(|s| s.to_string()).collect(),
            stdin: None,
            timeout: Some(Duration::from_secs(15)),
            cancellation: None,
        };
        match mgr.run(spec).await {
            Ok(out) => {
                let (label, text) = match stream {
                    Stream::Stdout => ("stdout", String::from_utf8_lossy(&out.stdout)),
                    Stream::Stderr => ("stderr", String::from_utf8_lossy(&out.stderr)),
                };
                if !text.contains(expected_token) {
                    failures.push(format!(
                        "{name}: exit 0 but {label} did not contain {expected_token:?}: {text:?}"
                    ));
                }
            }
            Err(e) => failures.push(format!("{name}: {e:?}")),
        }
    }

    assert!(
        failures.is_empty(),
        "sidecar launch gate failed for {} of {}:\n{}",
        failures.len(),
        SIDECARS.len(),
        failures.join("\n")
    );
}

/// Plan 047 installed-layout gate: same five launches, but resolved through
/// `SidecarManager`'s `PDF_EDITOR_INSTALL_DIR` env override (see
/// `sidecars/manager.rs`) instead of the test binary's own directory, so
/// this runs against a REAL MSI install directory (`Program Files\PDF
/// Editor` for the shipped perMachine MSI, or an administrative-extract
/// directory standing in for it, see
/// `.vault/process/plans/plan_v1_sidecar_dlls.md`) rather than a simulated
/// `target/debug` shape. Requires `PDF_EDITOR_INSTALL_DIR` to be set to that
/// directory before `cargo test --features sidecar-tests` (the
/// `cfg_attr` below only controls whether the test runs at all under a
/// plain `cargo test`; it is unrelated to the check below).
///
/// Plan 047 fix wave 1, F1: this test FAILS, with a message naming the
/// problem, when `PDF_EDITOR_INSTALL_DIR` is unset, empty, points to a
/// missing directory, or points to a directory that is missing any of the
/// five sidecar exes. It must never quietly pass in any of those cases. It
/// also does not lean on `SidecarManager::resolve_binary`'s own
/// `CARGO_MANIFEST_DIR` fallback (see `manager.rs`) to find the exes: that
/// fallback exists so dev builds and `cargo build --release` still work,
/// and is correct there, but if this test relied on it, a
/// `PDF_EDITOR_INSTALL_DIR` pointing at a directory with no sidecars at all
/// would silently pass by finding the dev checkout's `src-tauri/sidecars/`
/// binaries instead. So this test checks the exes exist directly under
/// `PDF_EDITOR_INSTALL_DIR` itself, with no fallback, before it ever calls
/// into `SidecarManager`.
#[tokio::test]
#[cfg_attr(
    not(feature = "sidecar-tests"),
    ignore = "requires real sidecar binaries and a real MSI install; set \
              PDF_EDITOR_INSTALL_DIR then run with --features sidecar-tests"
)]
async fn all_five_sidecars_launch_through_manager_from_installed_layout() {
    let install_dir = std::env::var("PDF_EDITOR_INSTALL_DIR").unwrap_or_default();
    assert!(
        !install_dir.is_empty(),
        "PDF_EDITOR_INSTALL_DIR is unset or empty; set it to a real MSI installed-layout \
         directory (an administrative extract, see \
         .vault/process/plans/plan_v1_sidecar_dlls.md, or a real per-machine install under \
         %ProgramFiles%\\PDF Editor) before running --features sidecar-tests"
    );
    let install_path = std::path::Path::new(&install_dir);
    assert!(
        install_path.is_dir(),
        "PDF_EDITOR_INSTALL_DIR={install_dir} does not exist or is not a directory"
    );

    // F1: check the five exes directly, with no fallback. See the doc
    // comment above for why `SidecarManager::resolve_binary`'s own
    // `CARGO_MANIFEST_DIR` fallback must not be the thing that makes this
    // pass.
    let names: Vec<&str> = SIDECARS.iter().map(|(n, _, _, _)| *n).collect();
    let mut missing: Vec<String> = Vec::new();
    for name in &names {
        let exe = install_path.join(format!("{name}.exe"));
        if !exe.exists() {
            missing.push(exe.display().to_string());
        }
    }
    let dll_dir = install_path.join("sidecars");
    if !dll_dir.is_dir() {
        missing.push(format!("{} (sidecar DLL directory)", dll_dir.display()));
    }
    assert!(
        missing.is_empty(),
        "PDF_EDITOR_INSTALL_DIR={install_dir} is not a complete installed layout, \
         missing:\n{}",
        missing.join("\n")
    );

    let original_path = std::env::var_os("PATH");
    // SAFETY: this test file has exactly one test function using this
    // pattern at a time under the default single-threaded-per-file
    // execution `cargo test` gives distinct integration test binaries; no
    // other thread in this process mutates or reads PATH concurrently.
    unsafe {
        std::env::set_var("PATH", "C:\\Windows\\System32;C:\\Windows");
    }

    let mgr = SidecarManager::new(4);
    let mut failures: Vec<String> = Vec::new();

    for (name, args, expected_token, stream) in SIDECARS {
        let spec = SidecarRunSpec {
            name: (*name).into(),
            args: args.iter().map(|s| s.to_string()).collect(),
            stdin: None,
            timeout: Some(Duration::from_secs(15)),
            cancellation: None,
        };
        match mgr.run(spec).await {
            Ok(out) => {
                let (label, text) = match stream {
                    Stream::Stdout => ("stdout", String::from_utf8_lossy(&out.stdout)),
                    Stream::Stderr => ("stderr", String::from_utf8_lossy(&out.stderr)),
                };
                if !text.contains(expected_token) {
                    failures.push(format!(
                        "{name}: exit 0 but {label} did not contain {expected_token:?}: {text:?}"
                    ));
                }
            }
            Err(e) => failures.push(format!("{name}: {e:?}")),
        }
    }

    // SAFETY: see above.
    unsafe {
        match &original_path {
            Some(v) => std::env::set_var("PATH", v),
            None => std::env::remove_var("PATH"),
        }
    }

    assert!(
        failures.is_empty(),
        "installed-layout sidecar launch gate failed for {} of {}:\n{}",
        failures.len(),
        SIDECARS.len(),
        failures.join("\n")
    );
}
