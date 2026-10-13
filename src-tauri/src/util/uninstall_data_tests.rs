use super::*;
use tempfile::TempDir;

/// An isolated copy of `%APPDATA%` and `%LOCALAPPDATA%` with every store the
/// contract lists, filled with files named the way the app names them.
struct Tree {
    tmp: TempDir,
    roots: DataRoots,
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

/// The app's own files, relative to the data folder.
const APP_FILES: [&str; 11] = [
    "settings.json",
    "app.db",
    "app.db-wal",
    "app.db-shm",
    r"projects\Contract.pdf-project",
    r"pipeline-presets\Compress.pdf-pipeline",
    r"tessdata-extra\fra.traineddata",
    r"thumbnails\0123456789abcdef01234567.png",
    r"logs\pdf-editor.2026-10-12.log",
    r"logs\2026-10-12_10-00-00.panic.txt",
    r"logs\2026-10-12_10-00-01.crash.txt",
];

impl Tree {
    fn new() -> Self {
        Self::new_in("user")
    }

    /// `profile` is the folder between the temp folder and `AppData`.
    fn new_in(profile: &str) -> Self {
        let tmp = TempDir::new().unwrap();
        let roaming = tmp.path().join(profile).join(r"AppData\Roaming");
        let local = tmp.path().join(profile).join(r"AppData\Local");
        std::fs::create_dir_all(&roaming).unwrap();
        std::fs::create_dir_all(&local).unwrap();
        let roots = DataRoots {
            app_data: roaming.join(r"PdfEditor\PdfEditor\data"),
            tauri_roaming: roaming.join(TAURI_IDENTIFIER),
            tauri_local: local.join(TAURI_IDENTIFIER),
            roaming,
            local,
        };
        for name in APP_FILES {
            write(&roots.app_data.join(name), "app");
        }
        write(
            &webview(&roots).join(r"Default\Local Storage\leveldb\000003.log"),
            "ls",
        );
        write(&signatures(&roots).join(SIGNATURE_INDEX), "[]");
        write(&signatures(&roots).join("3f2a9c.png"), "sig");
        Self { tmp, roots }
    }

    fn outside(&self) -> PathBuf {
        self.tmp.path().join("Outside")
    }

    fn app_files(&self) -> Vec<PathBuf> {
        let mut files: Vec<PathBuf> = APP_FILES
            .iter()
            .map(|n| self.roots.app_data.join(n))
            .collect();
        files.push(webview(&self.roots));
        files
    }

    fn signature_files(&self) -> Vec<PathBuf> {
        let dir = signatures(&self.roots);
        vec![dir.join(SIGNATURE_INDEX), dir.join("3f2a9c.png")]
    }
}

fn webview(roots: &DataRoots) -> PathBuf {
    roots.tauri_local.join(WEBVIEW_DIR)
}

fn signatures(roots: &DataRoots) -> PathBuf {
    roots.tauri_roaming.join(SIGNATURES_DIR)
}

fn exists(paths: &[PathBuf]) -> Vec<bool> {
    paths.iter().map(|path| path.exists()).collect()
}

/// Every file under `dir`, recursively, as text with its content.
fn snapshot(dir: &Path) -> Vec<String> {
    let mut found = Vec::new();
    for entry in walkdir::WalkDir::new(dir).sort_by_file_name() {
        let entry = entry.unwrap();
        if entry.file_type().is_file() {
            let text = std::fs::read_to_string(entry.path()).unwrap();
            found.push(format!("{} = {text}", entry.path().display()));
        }
    }
    found
}

fn choice(app_data: bool, signatures: bool) -> Choice {
    Choice {
        app_data,
        signatures,
    }
}

/// A directory junction made with `mklink /J` (needs no special right).
/// `false` with a message when Windows refuses, so the caller can skip.
fn junction(link: &Path, target: &Path) -> bool {
    let made = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .is_ok_and(|out| out.status.success());
    if !made {
        eprintln!("SKIPPED: mklink /J {} failed", link.display());
    }
    made
}

/// A folder outside the data roots with files that the cleanup would delete
/// if it followed a link to it.
fn outside_with_bait(dir: &Path) -> Vec<String> {
    for name in [
        "x.pdf-project",
        "notes.txt",
        "pdf-editor.2026-01-01.log",
        "settings.json",
    ] {
        write(&dir.join(name), "foreign");
    }
    snapshot(dir)
}

#[test]
fn no_to_both_questions_keeps_everything() {
    let tree = Tree::new();

    let report = remove_user_data(&tree.roots, choice(false, false));

    assert_eq!(report, Report::default());
    assert!(tree.app_files().iter().all(|item| item.exists()));
    assert!(tree.signature_files().iter().all(|item| item.exists()));
}

#[test]
fn yes_to_app_data_only_keeps_the_signatures() {
    let tree = Tree::new();

    let report = remove_user_data(&tree.roots, choice(true, false));

    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert_eq!(exists(&tree.app_files()), vec![false; APP_FILES.len() + 1]);
    assert!(tree.signature_files().iter().all(|item| item.exists()));
    assert!(
        !tree.roots.roaming.join("PdfEditor").exists(),
        "empty folders go"
    );
    assert!(!tree.roots.tauri_local.exists());
    assert!(tree.roots.tauri_roaming.exists());
}

#[test]
fn yes_to_signatures_only_keeps_the_app_data() {
    let tree = Tree::new();

    let report = remove_user_data(&tree.roots, choice(false, true));

    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert!(!tree.roots.tauri_roaming.exists());
    assert!(tree.app_files().iter().all(|item| item.exists()));
}

#[test]
fn yes_to_both_removes_every_listed_store_and_the_empty_parents() {
    let tree = Tree::new();

    let report = remove_user_data(&tree.roots, choice(true, true));

    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert_eq!(report.removed.len(), APP_FILES.len() + 1 + 2);
    assert!(!tree.roots.roaming.join("PdfEditor").exists());
    assert!(!tree.roots.tauri_roaming.exists());
    assert!(!tree.roots.tauri_local.exists());
    assert!(
        tree.roots.roaming.exists() && tree.roots.local.exists(),
        "never past %APPDATA%"
    );
}

#[test]
fn unknown_files_and_pdfs_stay_and_keep_their_folders() {
    let tree = Tree::new();
    let data = &tree.roots.app_data;
    let foreign = vec![
        data.join(r"projects\notes.txt"),
        data.join(r"projects\photo.jpg"),
        data.join(r"projects\exported.pdf"),
        data.join(r"projects\old\Contract.pdf-project"),
        data.join("notes.txt"),
        data.join("Invoice.PDF"),
        data.join(r"logs\my-notes.log"),
        data.join(r"thumbnails\holiday.png"),
        data.join(r"tessdata-extra\readme.txt"),
        webview(&tree.roots).join("saved.pdf"),
        signatures(&tree.roots).join("signed-contract.pdf"),
        signatures(&tree.roots).join("notes.txt"),
        tree.roots.tauri_roaming.join("other-tool.ini"),
        tree.roots
            .roaming
            .join(r"PdfEditor\PdfEditor\config\foreign.toml"),
        tree.roots.local.join(r"Other App\data.db"),
    ];
    for file in &foreign {
        write(file, "not ours");
    }

    let report = remove_user_data(&tree.roots, choice(true, true));

    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert_eq!(exists(&foreign), vec![true; foreign.len()]);
    assert_eq!(
        exists(&tree.app_files()[..APP_FILES.len()]),
        vec![false; APP_FILES.len()]
    );
    assert_eq!(exists(&tree.signature_files()), vec![false; 2]);
}

#[test]
fn projects_junction_refuses_the_whole_part() {
    let tree = Tree::new();
    let outside = tree.outside();
    let before = outside_with_bait(&outside);
    let projects = tree.roots.app_data.join("projects");
    std::fs::remove_dir_all(&projects).unwrap();
    if !junction(&projects, &outside) {
        return;
    }

    let report = remove_user_data(&tree.roots, choice(true, false));

    assert_eq!(snapshot(&outside), before, "nothing outside is deleted");
    assert_eq!(report.exit_code(), EXIT_REFUSED);
    assert_eq!(report.refused.len(), 1, "{report:?}");
    assert_eq!(report.refused[0].0, projects);
    assert!(report.removed.is_empty(), "nothing in the part goes");
    assert!(tree.roots.app_data.join("settings.json").exists());
    assert!(webview(&tree.roots).exists());
    assert!(projects.exists(), "the link itself stays");
}

#[test]
fn ancestor_junction_refuses_the_part_and_the_other_part_still_runs() {
    let tree = Tree::new();
    let outside = tree.outside();
    let pdf_editor = tree.roots.roaming.join("PdfEditor");
    std::fs::rename(&pdf_editor, &outside).unwrap();
    let before = snapshot(&outside);
    if !junction(&pdf_editor, &outside) {
        return;
    }

    let report = remove_user_data(&tree.roots, choice(true, true));

    assert_eq!(snapshot(&outside), before);
    assert_eq!(report.exit_code(), EXIT_REFUSED);
    assert!(report.refused.iter().any(|(dir, why)| {
        *dir == tree.roots.app_data.join("projects") && why.contains("PdfEditor is a link")
    }));
    assert!(
        webview(&tree.roots).exists(),
        "the whole app-data part stays"
    );
    assert_eq!(exists(&tree.signature_files()), vec![false; 2]);
}

#[test]
fn child_junctions_are_left_in_place_and_never_followed() {
    let tree = Tree::new();
    let outside = tree.outside();
    let before = outside_with_bait(&outside);
    let in_logs = tree.roots.app_data.join(r"logs\archive");
    let in_webview = webview(&tree.roots).join(r"Default\linked");
    if !junction(&in_logs, &outside) || !junction(&in_webview, &outside) {
        return;
    }

    let report = remove_user_data(&tree.roots, choice(true, false));

    assert_eq!(snapshot(&outside), before, "link targets stay untouched");
    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert!(in_logs.exists() && in_webview.exists(), "the links stay");
    assert!(!tree
        .roots
        .app_data
        .join(r"logs\pdf-editor.2026-10-12.log")
        .exists());
    assert!(!tree.roots.app_data.join("settings.json").exists());
}

#[cfg(windows)]
#[test]
fn file_symlink_named_like_a_log_is_left_in_place() {
    let tree = Tree::new();
    let target = tree.outside().join("important.txt");
    write(&target, "foreign");
    let link = tree.roots.app_data.join(r"logs\pdf-editor.2026-10-11.log");
    if let Err(e) = std::os::windows::fs::symlink_file(&target, &link) {
        eprintln!("SKIPPED: this process cannot create symbolic links ({e})");
        return;
    }

    let report = remove_user_data(&tree.roots, choice(true, false));

    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "foreign");
    assert!(std::fs::symlink_metadata(&link).is_ok(), "the link stays");
}

#[test]
fn a_root_outside_its_base_is_refused() {
    let tree = Tree::new();
    let mut roots = tree.roots.clone();
    roots.tauri_local = tree.outside().join(TAURI_IDENTIFIER);
    write(&webview(&roots).join("Default\\file"), "foreign");

    let report = remove_user_data(&roots, choice(true, false));

    assert_eq!(report.exit_code(), EXIT_REFUSED);
    assert!(report.refused[0].1.contains("is not inside"), "{report:?}");
    assert!(webview(&roots).join("Default\\file").exists());
}

#[test]
fn profile_with_spaces_and_slovak_letters_works() {
    let tree = Tree::new_in("Michal Šťastný Ľubovníkový");

    let report = remove_user_data(&tree.roots, choice(true, true));

    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert!(!tree.roots.roaming.join("PdfEditor").exists());
    assert!(!tree.roots.tauri_roaming.exists());
}

#[test]
fn paths_longer_than_260_characters_work() {
    let deep = ["a-long-folder-name-for-the-path-limit-test-0123456789"; 5].join("\\");
    let tree = Tree::new_in(&deep);
    let longest = tree
        .roots
        .tauri_local
        .join(r"EBWebView\Default\Local Storage\leveldb\000003.log");
    assert!(longest.as_os_str().len() > 260, "{}", longest.display());

    let report = remove_user_data(&tree.roots, choice(true, true));

    assert_eq!(report.exit_code(), EXIT_OK, "{report:?}");
    assert!(!longest.exists());
    assert!(!tree.roots.roaming.join("PdfEditor").exists());
}

#[test]
fn name_rules_accept_only_the_app_naming() {
    assert!(is_log_file("pdf-editor.2026-10-12.log"));
    assert!(is_log_file("2026-10-12_10-00-00.panic.txt"));
    assert!(is_log_file("2026-10-12_10-00-00.crash.txt"));
    assert!(!is_log_file("pdf-editor.log"));
    assert!(!is_log_file("pdf-editor.2026-1-12.log"));
    assert!(!is_log_file("2026-10-12_10-00-00.notes.txt"));
    assert!(!is_log_file("my.2026-10-12.log"));
    assert!(is_thumbnail("0123456789abcdef01234567.png"));
    assert!(!is_thumbnail("0123456789ABCDEF01234567.png"));
    assert!(!is_thumbnail("holiday.png"));
    assert!(is_project_file("A.PDF-PROJECT") && !is_project_file("a.json"));
    assert!(is_preset_file("a.pdf-pipeline") && !is_preset_file("a.pdf"));
    assert!(is_ocr_language("fra.traineddata") && !is_ocr_language("fra.txt"));
    assert!(is_signature_file("index.json") && is_signature_file("a.png"));
    assert!(!is_signature_file("other.json") && !is_signature_file("a.pdf"));
    assert!(is_app_data_file("app.db-wal") && !is_app_data_file("app.db-journal"));
}

#[test]
fn exit_code_names_the_worst_result() {
    let failed = || (PathBuf::from("a"), "denied".to_owned());
    let mut report = Report::default();
    assert_eq!(report.exit_code(), EXIT_OK);
    report.failed.push(failed());
    assert_eq!(report.exit_code(), EXIT_FAILED);
    report.refused.push(failed());
    assert_eq!(report.exit_code(), EXIT_REFUSED);
}

#[test]
fn silent_uninstall_never_passes_the_flag_so_nothing_runs() {
    assert_eq!(run_from_args(["pdf-editor.exe"]), None);
    assert_eq!(run_from_args(["pdf-editor.exe", r"C:\docs\a.pdf"]), None);
}

#[test]
fn parts_after_the_flag_select_what_goes() {
    let parse = |args: &[&str]| parse_args(args.iter().copied());

    assert_eq!(parse(&["pdf-editor.exe", FLAG]), Some(choice(false, false)));
    assert_eq!(
        parse(&["pdf-editor.exe", FLAG, PART_APP_DATA]),
        Some(choice(true, false))
    );
    assert_eq!(
        parse(&["pdf-editor.exe", FLAG, PART_SIGNATURES]),
        Some(choice(false, true))
    );
    assert_eq!(
        parse(&[
            "pdf-editor.exe",
            FLAG,
            PART_APP_DATA,
            PART_SIGNATURES,
            "everything"
        ]),
        Some(choice(true, true))
    );
    assert_eq!(parse(&["pdf-editor.exe", PART_APP_DATA]), None);
}

#[test]
fn current_roots_match_the_app_paths() {
    let roots = DataRoots::current().expect("user folders");

    assert!(roots.app_data.ends_with(r"PdfEditor\PdfEditor\data"));
    assert!(roots.app_data.starts_with(&roots.roaming));
    assert_eq!(roots.tauri_roaming, roots.roaming.join(TAURI_IDENTIFIER));
    assert_eq!(roots.tauri_local, roots.local.join(TAURI_IDENTIFIER));
}
