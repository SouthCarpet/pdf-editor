//! User-data removal for the uninstaller (plan 119, survey task 5).
//!
//! `packaging/pdf-editor.iss` asks two questions when the user uninstalls
//! (both default to No) and then runs
//! `pdf-editor.exe --remove-user-data [app-data] [signatures]` before it
//! removes the program files. A silent uninstall asks nothing and never
//! runs it, so it keeps all data.
//!
//! Delete set (`docs/install-contract.md`, "Uninstall choices"). It comes
//! only from the constants and name rules in this file; no setting and no
//! argument can make it larger.
//! - `app-data`: in the data folder the files `APP_DATA_FILES`, and in each
//!   folder of `APP_DATA_STORES` only the files whose name matches the
//!   app's own naming rule; the app's WebView2 profile `EBWebView` as a
//!   whole.
//! - `signatures`: `index.json` and the `*.png` images in `signatures`.
//!
//! Every other file stays, and so does a folder that still holds anything.
//! A PDF file is never deleted. Links:
//! - A part is refused (nothing in it is deleted, `Report::refused` names
//!   it) when one of its folders, or a folder between it and `%APPDATA%` /
//!   `%LOCALAPPDATA%`, is a reparse point, or when its real path is not
//!   inside that base.
//! - A reparse point inside a folder (junction, symbolic link, cloud
//!   placeholder) is never followed and never deleted: it stays, so its
//!   folder stays too.
use crate::util::reparse;
use std::path::{Component, Path, PathBuf};

pub const FLAG: &str = "--remove-user-data";
pub const PART_APP_DATA: &str = "app-data";
pub const PART_SIGNATURES: &str = "signatures";

/// `tauri.conf.json` `identifier`: Tauri keeps signatures and the WebView2
/// profile under folders with this name.
pub const TAURI_IDENTIFIER: &str = "com.pdfeditor.app";

pub const APP_DATA_FILES: [&str; 4] = ["settings.json", "app.db", "app.db-wal", "app.db-shm"];
pub const WEBVIEW_DIR: &str = "EBWebView";
pub const SIGNATURES_DIR: &str = "signatures";
/// `commands/signatures.rs` `INDEX_FILE`.
pub const SIGNATURE_INDEX: &str = "index.json";

/// A name rule: `true` for a file name the app writes.
type Owns = fn(&str) -> bool;

/// The folders under the data folder and the rule for the files the app
/// writes in each one.
pub const APP_DATA_STORES: [(&str, Owns); 5] = [
    ("projects", is_project_file),
    ("pipeline-presets", is_preset_file),
    ("tessdata-extra", is_ocr_language),
    ("thumbnails", is_thumbnail),
    ("logs", is_log_file),
];

/// The user's base folders and the three roots the app writes user data to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataRoots {
    /// `%APPDATA%`. `app_data` and `tauri_roaming` must stay inside it.
    pub roaming: PathBuf,
    /// `%LOCALAPPDATA%`. `tauri_local` must stay inside it.
    pub local: PathBuf,
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
            roaming: base.data_dir().to_path_buf(),
            local: base.data_local_dir().to_path_buf(),
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

/// Exit code: every selected item went (or nothing was there).
pub const EXIT_OK: i32 = 0;
/// Exit code: a file could not be deleted.
pub const EXIT_FAILED: i32 = 1;
/// Exit code: Windows did not give the user folders.
pub const EXIT_NO_USER_FOLDERS: i32 = 2;
/// Exit code: a part was refused because of a link; nothing in it went.
pub const EXIT_REFUSED: i32 = 3;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub removed: Vec<PathBuf>,
    pub failed: Vec<(PathBuf, String)>,
    /// Folders of a refused part and the reason.
    pub refused: Vec<(PathBuf, String)>,
}

impl Report {
    fn record(&mut self, path: &Path, result: std::io::Result<()>) {
        match result {
            Ok(()) => self.removed.push(path.to_path_buf()),
            Err(e) => self.failed.push((path.to_path_buf(), e.to_string())),
        }
    }

    pub fn exit_code(&self) -> i32 {
        if !self.refused.is_empty() {
            EXIT_REFUSED
        } else if !self.failed.is_empty() {
            EXIT_FAILED
        } else {
            EXIT_OK
        }
    }
}

fn has_extension(name: &str, extension: &str) -> bool {
    Path::new(name)
        .extension()
        .is_some_and(|found| found.eq_ignore_ascii_case(extension))
}

/// `name` has the shape of `pattern`: `9` stands for one ASCII digit, any
/// other character for itself.
fn has_shape(name: &str, pattern: &str) -> bool {
    name.len() == pattern.len()
        && name.bytes().zip(pattern.bytes()).all(|(c, p)| match p {
            b'9' => c.is_ascii_digit(),
            _ => c == p,
        })
}

fn is_app_data_file(name: &str) -> bool {
    APP_DATA_FILES.contains(&name)
}

/// The app's project file (`.pdf-project`, the owned association).
fn is_project_file(name: &str) -> bool {
    has_extension(name, "pdf-project")
}

/// The app's pipeline file (`.pdf-pipeline`, the owned association).
fn is_preset_file(name: &str) -> bool {
    has_extension(name, "pdf-pipeline")
}

/// A user OCR language `commands/tessdata.rs` copied in.
fn is_ocr_language(name: &str) -> bool {
    has_extension(name, "traineddata")
}

/// `commands/render.rs`: 24 lower-case hex digits and `.png`.
fn is_thumbnail(name: &str) -> bool {
    name.strip_suffix(".png").is_some_and(|key| {
        key.len() == 24
            && key
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    })
}

/// `util/logging.rs` daily logs `pdf-editor.YYYY-MM-DD.log` and
/// `util/crash_logger.rs` files `YYYY-MM-DD_HH-MM-SS.<panic|crash>.txt`.
fn is_log_file(name: &str) -> bool {
    let daily = name
        .strip_prefix("pdf-editor.")
        .and_then(|rest| rest.strip_suffix(".log"))
        .is_some_and(|date| has_shape(date, "9999-99-99"));
    let crash = [".panic.txt", ".crash.txt"].iter().any(|kind| {
        name.strip_suffix(kind)
            .is_some_and(|stamp| has_shape(stamp, "9999-99-99_99-99-99"))
    });
    daily || crash
}

/// `commands/signatures.rs`: the index and the signature images.
fn is_signature_file(name: &str) -> bool {
    name == SIGNATURE_INDEX || has_extension(name, "png")
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}

/// Which files of a folder go.
#[derive(Clone, Copy)]
enum Owned {
    /// Files directly in the folder that the rule accepts. Subfolders stay.
    Files(Owns),
    /// Every file in the tree except PDF files (only the app's `EBWebView`).
    Tree,
}

/// One folder of a part, the base folder it must stay inside, and what goes.
struct Target {
    base: PathBuf,
    dir: PathBuf,
    owned: Owned,
}

impl Target {
    fn new(base: &Path, dir: PathBuf, owned: Owned) -> Self {
        Self {
            base: base.to_path_buf(),
            dir,
            owned,
        }
    }
}

/// The `app-data` part. The data folder itself comes last, so that its
/// empty subfolders are gone when it is checked.
fn app_data_targets(roots: &DataRoots) -> Vec<Target> {
    let mut targets: Vec<Target> = APP_DATA_STORES
        .iter()
        .map(|(name, owns)| {
            Target::new(
                &roots.roaming,
                roots.app_data.join(name),
                Owned::Files(*owns),
            )
        })
        .collect();
    targets.push(Target::new(
        &roots.local,
        roots.tauri_local.join(WEBVIEW_DIR),
        Owned::Tree,
    ));
    targets.push(Target::new(
        &roots.roaming,
        roots.app_data.clone(),
        Owned::Files(is_app_data_file),
    ));
    targets
}

fn signature_targets(roots: &DataRoots) -> Vec<Target> {
    vec![Target::new(
        &roots.roaming,
        roots.tauri_roaming.join(SIGNATURES_DIR),
        Owned::Files(is_signature_file),
    )]
}

/// `Ok(true)`: `path` exists and is not a reparse point. `Ok(false)`: it
/// does not exist. `Err`: it is a reparse point or cannot be read.
fn exists_unlinked(path: &Path) -> Result<bool, String> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if reparse::is_reparse_point(&meta) => {
            Err(format!("{} is a link (reparse point)", path.display()))
        }
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// `Err` when `dir` must not be touched: it is not below `base`, it or a
/// folder between it and `base` is a reparse point, or its real path is not
/// inside the real `base`. A `dir` that does not exist is `Ok` (nothing to
/// delete).
fn check_root(base: &Path, dir: &Path) -> Result<(), String> {
    let below = dir
        .strip_prefix(base)
        .map_err(|_| format!("{} is not inside {}", dir.display(), base.display()))?;
    let mut path = base.to_path_buf();
    for component in below.components() {
        let Component::Normal(name) = component else {
            return Err(format!("{} is not a plain path", dir.display()));
        };
        path.push(name);
        if !exists_unlinked(&path)? {
            return Ok(());
        }
    }
    check_real_path(base, dir)
}

fn check_real_path(base: &Path, dir: &Path) -> Result<(), String> {
    let real =
        |path: &Path| std::fs::canonicalize(path).map_err(|e| format!("{}: {e}", path.display()));
    let (real_base, real_dir) = (real(base)?, real(dir)?);
    if real_dir.starts_with(&real_base) {
        Ok(())
    } else {
        Err(format!(
            "{} leads to {}, outside {}",
            dir.display(),
            real_dir.display(),
            real_base.display()
        ))
    }
}

/// The entries of `dir` that are not reparse points, with "is a folder".
/// Links and entries that cannot be read are left out, so they stay.
fn real_entries(dir: &Path) -> Vec<(PathBuf, bool)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let meta = std::fs::symlink_metadata(&path).ok()?;
            (!reparse::is_reparse_point(&meta)).then(|| (path, meta.is_dir()))
        })
        .collect()
}

fn remove_owned_files(dir: &Path, owns: Owns, report: &mut Report) {
    for (path, is_dir) in real_entries(dir) {
        let name = path.file_name().and_then(|name| name.to_str());
        if !is_dir && name.is_some_and(owns) {
            report.record(&path, std::fs::remove_file(&path));
        }
    }
}

/// Removes every file under `dir` except PDF files, then every subfolder
/// that is empty after that.
fn remove_tree(dir: &Path, report: &mut Report) {
    for (path, is_dir) in real_entries(dir) {
        if is_dir {
            remove_tree(&path, report);
            let _ = std::fs::remove_dir(&path);
        } else if !is_pdf(&path) {
            report.record(&path, std::fs::remove_file(&path));
        }
    }
}

/// Removes `dir` and its empty parents up to (not including) `base`. Stops
/// at a folder that still holds anything or that is a link.
fn remove_empty_dirs(dir: &Path, base: &Path) {
    let mut current = Some(dir);
    while let Some(path) = current.filter(|path| path.starts_with(base) && *path != base) {
        match exists_unlinked(path) {
            Ok(false) => {}
            Ok(true) if std::fs::remove_dir(path).is_ok() => {}
            _ => return,
        }
        current = path.parent();
    }
}

/// Checks every folder of the part first; one refused folder keeps the
/// whole part.
fn remove_part(targets: &[Target], report: &mut Report) {
    let refused: Vec<(PathBuf, String)> = targets
        .iter()
        .filter_map(|target| {
            check_root(&target.base, &target.dir)
                .err()
                .map(|why| (target.dir.clone(), why))
        })
        .collect();
    if !refused.is_empty() {
        report.refused.extend(refused);
        return;
    }
    for target in targets {
        match target.owned {
            Owned::Files(owns) => remove_owned_files(&target.dir, owns, report),
            Owned::Tree => remove_tree(&target.dir, report),
        }
        remove_empty_dirs(&target.dir, &target.base);
    }
}

/// Removes what `choice` names and returns what was removed, what failed
/// and what was refused.
pub fn remove_user_data(roots: &DataRoots, choice: Choice) -> Report {
    let mut report = Report::default();
    if choice.app_data {
        remove_part(&app_data_targets(roots), &mut report);
    }
    if choice.signatures {
        remove_part(&signature_targets(roots), &mut report);
    }
    report
}

/// Entry point from `main`: `Some(exit code)` when the uninstaller called
/// the app with `--remove-user-data`, `None` for a normal start. Exit codes:
/// `EXIT_OK`, `EXIT_FAILED`, `EXIT_NO_USER_FOLDERS`, `EXIT_REFUSED`.
pub fn run_from_args<I, S>(args: I) -> Option<i32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let choice = parse_args(args)?;
    let Some(roots) = DataRoots::current() else {
        return Some(EXIT_NO_USER_FOLDERS);
    };
    Some(remove_user_data(&roots, choice).exit_code())
}

#[cfg(test)]
#[path = "uninstall_data_tests.rs"]
mod tests;
