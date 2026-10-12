use super::*;
use tempfile::TempDir;

/// An isolated copy of the three user-data roots with every store the
/// contract lists, a PDF the user exported into the data folders, and
/// files that are not the app's.
struct Tree {
    _tmp: TempDir,
    roaming: PathBuf,
    local: PathBuf,
    roots: DataRoots,
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

impl Tree {
    fn new() -> Self {
        let tmp = TempDir::new().unwrap();
        let roaming = tmp.path().join("Roaming");
        let local = tmp.path().join("Local");
        let roots = DataRoots {
            app_data: roaming.join(r"PdfEditor\PdfEditor\data"),
            tauri_roaming: roaming.join(TAURI_IDENTIFIER),
            tauri_local: local.join(TAURI_IDENTIFIER),
        };
        let data = &roots.app_data;
        for name in APP_DATA_FILES {
            write(&data.join(name), "app");
        }
        write(&data.join(r"projects\p1.json"), "project");
        write(&data.join(r"pipeline-presets\preset.json"), "preset");
        write(&data.join(r"tessdata-extra\fra.traineddata"), "ocr");
        write(&data.join(r"thumbnails\ab\cd.png"), "thumb");
        write(&data.join(r"logs\pdf-editor.2026-10-12.log"), "log");
        write(
            &roots
                .tauri_local
                .join(r"EBWebView\Default\Local Storage\leveldb\000003.log"),
            "ls",
        );
        write(&roots.tauri_roaming.join(r"signatures\me.png"), "sig");
        Self {
            _tmp: tmp,
            roaming,
            local,
            roots,
        }
    }

    fn add_foreign_files(&self) -> Vec<PathBuf> {
        let files = vec![
            self.roots.app_data.join("notes.txt"),
            self.roots.app_data.join("Invoice.PDF"),
            self.roots.app_data.join(r"projects\exported.pdf"),
            self.roots
                .tauri_roaming
                .join(r"signatures\signed-contract.pdf"),
            self.roots.tauri_roaming.join("other-tool.ini"),
            self.roaming
                .join(r"PdfEditor\PdfEditor\config\foreign.toml"),
            self.local.join(r"Other App\data.db"),
        ];
        for file in &files {
            write(file, "not ours");
        }
        files
    }

    fn app_data_items(&self) -> Vec<PathBuf> {
        let data = &self.roots.app_data;
        let mut items: Vec<PathBuf> = APP_DATA_FILES.iter().map(|n| data.join(n)).collect();
        items.extend(APP_DATA_DIRS.iter().map(|n| data.join(n)));
        items.push(self.roots.tauri_local.join(WEBVIEW_DIR));
        items
    }

    fn signatures(&self) -> PathBuf {
        self.roots.tauri_roaming.join(SIGNATURES_DIR)
    }
}

fn exists(paths: &[PathBuf]) -> Vec<bool> {
    paths.iter().map(|path| path.exists()).collect()
}

fn choice(app_data: bool, signatures: bool) -> Choice {
    Choice {
        app_data,
        signatures,
    }
}

#[test]
fn no_to_both_questions_keeps_everything() {
    let tree = Tree::new();

    let report = remove_user_data(&tree.roots, choice(false, false));

    assert!(report.removed.is_empty());
    assert!(tree.app_data_items().iter().all(|item| item.exists()));
    assert!(tree.signatures().join("me.png").exists());
}

#[test]
fn yes_to_app_data_only_keeps_the_signatures() {
    let tree = Tree::new();

    let report = remove_user_data(&tree.roots, choice(true, false));

    assert!(report.failed.is_empty(), "{:?}", report.failed);
    assert_eq!(exists(&tree.app_data_items()), vec![false; 10]);
    assert!(tree.signatures().join("me.png").exists());
    assert!(
        !tree.roots.app_data.exists(),
        "the empty data folder goes too"
    );
    assert!(!tree.roots.tauri_local.exists());
    assert!(tree.roots.tauri_roaming.exists());
}

#[test]
fn yes_to_signatures_only_keeps_the_app_data() {
    let tree = Tree::new();

    remove_user_data(&tree.roots, choice(false, true));

    assert!(!tree.signatures().exists());
    assert!(!tree.roots.tauri_roaming.exists());
    assert!(tree.app_data_items().iter().all(|item| item.exists()));
}

#[test]
fn yes_to_both_removes_every_listed_store_and_the_empty_parents() {
    let tree = Tree::new();

    let report = remove_user_data(&tree.roots, choice(true, true));

    assert!(report.failed.is_empty(), "{:?}", report.failed);
    assert!(!tree.roaming.join("PdfEditor").exists());
    assert!(!tree.roots.tauri_roaming.exists());
    assert!(!tree.roots.tauri_local.exists());
    assert!(
        tree.roaming.exists() && tree.local.exists(),
        "never past %APPDATA%"
    );
}

#[test]
fn pdfs_and_foreign_files_stay_and_keep_their_folders() {
    let tree = Tree::new();
    let foreign = tree.add_foreign_files();

    let report = remove_user_data(&tree.roots, choice(true, true));

    assert!(report.failed.is_empty(), "{:?}", report.failed);
    assert_eq!(exists(&foreign), vec![true; foreign.len()]);
    assert!(!tree.roots.app_data.join("settings.json").exists());
    assert!(!tree.roots.app_data.join(r"projects\p1.json").exists());
    assert!(!tree.signatures().join("me.png").exists());
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
    assert!(roots.tauri_roaming.ends_with(TAURI_IDENTIFIER));
    assert!(roots.tauri_local.ends_with(TAURI_IDENTIFIER));
}
