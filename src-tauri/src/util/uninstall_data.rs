//! User-data removal for the uninstaller (plan 119, survey task 5).
//!
//! `packaging/pdf-editor.iss` asks two questions when the user uninstalls
//! (both default to No) and then runs
//! `pdf-editor.exe --remove-user-data [app-data] [signatures]` before it
//! removes the program files. A silent uninstall asks nothing and never
//! runs it, so it keeps all data.
//!
//! Delete boundaries (`docs/install-contract.md`, "User data"):
//! - `app-data`: the files `APP_DATA_FILES` and the folders `APP_DATA_DIRS`
//!   in the data folder, and the WebView2 profile `EBWebView`.
//! - `signatures`: the `signatures` folder.
//!
//! PDF files are never deleted, also inside those folders, and nothing
//! outside the list is touched. A folder that still holds such a file stays.
use std::path::{Path, PathBuf};

pub const FLAG: &str = "--remove-user-data";
pub const PART_APP_DATA: &str = "app-data";
pub const PART_SIGNATURES: &str = "signatures";

/// `tauri.conf.json` `identifier`: Tauri keeps signatures and the WebView2
/// profile under folders with this name.
pub const TAURI_IDENTIFIER: &str = "com.pdfeditor.app";

pub const APP_DATA_FILES: [&str; 4] = ["settings.json", "app.db", "app.db-wal", "app.db-shm"];
pub const APP_DATA_DIRS: [&str; 5] = [
    "projects",
    "pipeline-presets",
    "tessdata-extra",
    "thumbnails",
    "logs",
];
pub const WEBVIEW_DIR: &str = "EBWebView";
pub const SIGNATURES_DIR: &str = "signatures";

/// The three roots the app writes user data to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataRoots {
    /// `%APPDATA%\PdfEditor\PdfEditor\data` (`util/paths.rs`).
    pub app_data: PathBuf,
    /// `%APPDATA%\com.pdfeditor.app` (Tauri `app_data_dir`).
    pub tauri_roaming: PathBuf,
    /// `%LOCALAPPDATA%\com.pdfeditor.app` (WebView2 profile parent).
    pub tauri_local: PathBuf,
}

impl DataRoots {
    /// The roots of the current user. Only computes paths; creates nothing.
    pub fn current() -> Option<Self> {
        let project = directories::ProjectDirs::from("com", "PdfEditor", "PdfEditor")?;
        let base = directories::BaseDirs::new()?;
        Some(Self {
            app_data: project.data_dir().to_path_buf(),
            tauri_roaming: base.data_dir().join(TAURI_IDENTIFIER),
            tauri_local: base.data_local_dir().join(TAURI_IDENTIFIER),
        })
    }
}

/// What the user chose to remove. Both false keeps everything.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Choice {
    pub app_data: bool,
    pub signatures: bool,
}

/// The parts after `--remove-user-data`, or `None` without the flag.
/// Unknown parts are ignored, so they remove nothing.
pub fn parse_args<I, S>(args: I) -> Option<Choice>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut args = args.into_iter();
    args.by_ref().find(|arg| arg.as_ref() == FLAG)?;
    let mut choice = Choice::default();
    for arg in args {
        match arg.as_ref() {
            PART_APP_DATA => choice.app_data = true,
            PART_SIGNATURES => choice.signatures = true,
            _ => {}
        }
    }
    Some(choice)
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub removed: Vec<PathBuf>,
    pub failed: Vec<(PathBuf, String)>,
}

impl Report {
    fn record(&mut self, path: &Path, result: std::io::Result<()>) {
        match result {
            Ok(()) => self.removed.push(path.to_path_buf()),
            Err(e) => self.failed.push((path.to_path_buf(), e.to_string())),
        }
    }
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}

fn remove_file(path: &Path, report: &mut Report) {
    if path.is_file() && !is_pdf(path) {
        report.record(path, std::fs::remove_file(path));
    }
}

/// Removes every file under `dir` except PDF files, then every folder that
/// is empty after that. Never follows a link out of `dir`.
fn remove_tree(dir: &Path, report: &mut Report) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_dir = entry.file_type().is_ok_and(|kind| kind.is_dir());
        if is_dir {
            remove_tree(&path, report);
        } else {
            remove_file(&path, report);
        }
    }
    let _ = std::fs::remove_dir(dir);
}

/// Removes `dir` and its empty parents up to (not past) `stop`. A folder
/// with anything left in it stays.
fn remove_empty_dirs(dir: &Path, stop: &Path) {
    let mut current = Some(dir);
    while let Some(path) = current.filter(|path| path.starts_with(stop) && *path != stop) {
        if std::fs::remove_dir(path).is_err() {
            return;
        }
        current = path.parent();
    }
}

fn remove_app_data(roots: &DataRoots, report: &mut Report) {
    for name in APP_DATA_FILES {
        remove_file(&roots.app_data.join(name), report);
    }
    for name in APP_DATA_DIRS {
        remove_tree(&roots.app_data.join(name), report);
    }
    remove_tree(&roots.tauri_local.join(WEBVIEW_DIR), report);
}

/// Removes what `choice` names and returns what was removed and what failed.
/// The data folder parents go only when they are empty, up to the user's
/// `%APPDATA%` / `%LOCALAPPDATA%` (the parent of `roots.tauri_*`).
pub fn remove_user_data(roots: &DataRoots, choice: Choice) -> Report {
    let mut report = Report::default();
    if choice.app_data {
        remove_app_data(roots, &mut report);
    }
    if choice.signatures {
        remove_tree(&roots.tauri_roaming.join(SIGNATURES_DIR), &mut report);
    }
    for (dir, base) in [
        (&roots.app_data, &roots.tauri_roaming),
        (&roots.tauri_roaming, &roots.tauri_roaming),
        (&roots.tauri_local, &roots.tauri_local),
    ] {
        if let Some(stop) = base.parent() {
            remove_empty_dirs(dir, stop);
        }
    }
    report
}

/// Entry point from `main`: `Some(exit code)` when the uninstaller called
/// the app with `--remove-user-data`, `None` for a normal start. Exit code
/// 0 when every listed item went, 1 when one failed, 2 without user folders.
pub fn run_from_args<I, S>(args: I) -> Option<i32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let choice = parse_args(args)?;
    let Some(roots) = DataRoots::current() else {
        return Some(2);
    };
    let report = remove_user_data(&roots, choice);
    Some(i32::from(!report.failed.is_empty()))
}

#[cfg(test)]
#[path = "uninstall_data_tests.rs"]
mod tests;
