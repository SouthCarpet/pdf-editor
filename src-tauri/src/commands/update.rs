use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct VersionCheck {
    pub embedded_commit: String,
    pub embedded_dirty: bool,
    pub repo_head: Option<String>,
    pub dirty: bool,
    pub behind: bool,
    pub error: Option<String>,
}

fn embedded_commit() -> String {
    option_env!("PDF_EDITOR_BUILD_COMMIT")
        .unwrap_or("unknown")
        .to_owned()
}

fn embedded_dirty() -> bool {
    option_env!("PDF_EDITOR_BUILD_DIRTY") == Some("true")
}

fn repo_root_for_exe(exe: &Path, debug_manifest_dir: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(manifest_dir) = debug_manifest_dir {
        return manifest_dir
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "CARGO_MANIFEST_DIR has no parent".to_owned());
    }

    exe.parent()
        .and_then(|release_dir| release_dir.ancestors().nth(3))
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            format!(
                "cannot resolve repository root relative to {}",
                exe.display()
            )
        })
}

fn git(repo_root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_root)
        .args(args)
        .output()
        .map_err(|error| format!("could not run git: {error}"))?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() {
            format!("git {} failed with {}", args.join(" "), output.status)
        } else {
            format!("git {} failed: {detail}", args.join(" "))
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn compare_version(
    embedded_commit: String,
    embedded_dirty: bool,
    repo_state: Result<(String, bool), String>,
) -> VersionCheck {
    match repo_state {
        Ok((repo_head, dirty)) => VersionCheck {
            behind: embedded_commit != "unknown" && embedded_commit != repo_head,
            embedded_commit,
            embedded_dirty,
            repo_head: Some(repo_head),
            dirty,
            error: None,
        },
        Err(error) => VersionCheck {
            embedded_commit,
            embedded_dirty,
            repo_head: None,
            dirty: false,
            behind: false,
            error: Some(error),
        },
    }
}

fn check_version() -> VersionCheck {
    let embedded_commit = embedded_commit();
    let embedded_dirty = embedded_dirty();
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(error) => {
            return compare_version(
                embedded_commit,
                embedded_dirty,
                Err(format!("could not resolve application path: {error}")),
            );
        }
    };

    let debug_manifest_dir = cfg!(debug_assertions).then(|| Path::new(env!("CARGO_MANIFEST_DIR")));
    let repo_root = match repo_root_for_exe(&exe, debug_manifest_dir) {
        Ok(repo_root) => repo_root,
        Err(error) => {
            return compare_version(embedded_commit, embedded_dirty, Err(error));
        }
    };

    let repo_state = git(&repo_root, &["rev-parse", "HEAD"]).and_then(|repo_head| {
        git(&repo_root, &["status", "--porcelain"]).map(|status| (repo_head, !status.is_empty()))
    });
    compare_version(embedded_commit, embedded_dirty, repo_state)
}

#[tauri::command]
#[specta::specta]
pub async fn check_for_update() -> VersionCheck {
    tauri::async_runtime::spawn_blocking(check_version)
        .await
        .unwrap_or_else(|error| {
            compare_version(
                embedded_commit(),
                embedded_dirty(),
                Err(format!("update check task failed: {error}")),
            )
        })
}

#[tauri::command]
#[specta::specta]
pub fn launch_update(app: AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("could not resolve application path: {error}"))?;
    let debug_manifest_dir = cfg!(debug_assertions).then(|| Path::new(env!("CARGO_MANIFEST_DIR")));
    let repo_root = repo_root_for_exe(&exe, debug_manifest_dir)?;
    let update_script = repo_root.join("scripts").join("update-pdf-editor.bat");

    if !update_script.is_file() {
        return Err(format!(
            "update script does not exist: {}",
            update_script.display()
        ));
    }

    #[cfg(windows)]
    Command::new("cmd")
        .args(["/D", "/C", "start", ""])
        .arg(&update_script)
        .current_dir(&repo_root)
        .spawn()
        .map_err(|error| format!("could not start update script: {error}"))?;

    #[cfg(not(windows))]
    return Err("local updates are only supported on Windows".to_owned());

    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{compare_version, repo_root_for_exe};
    use std::path::Path;

    #[test]
    fn reports_matching_commit() {
        let result = compare_version("abc123".to_owned(), false, Ok(("abc123".to_owned(), false)));

        assert!(!result.behind);
        assert!(!result.dirty);
        assert_eq!(result.error, None);
    }

    #[test]
    fn reports_older_embedded_commit() {
        let result = compare_version("abc123".to_owned(), false, Ok(("def456".to_owned(), false)));

        assert!(result.behind);
    }

    #[test]
    fn reports_dirty_repository_without_inventing_a_commit_difference() {
        let result = compare_version("abc123".to_owned(), true, Ok(("abc123".to_owned(), true)));

        assert!(!result.behind);
        assert!(result.embedded_dirty);
        assert!(result.dirty);
    }

    #[test]
    fn unknown_embedded_commit_is_not_reported_as_behind() {
        let result = compare_version(
            "unknown".to_owned(),
            false,
            Ok(("def456".to_owned(), false)),
        );

        assert!(!result.behind);
        assert_eq!(result.repo_head.as_deref(), Some("def456"));
    }

    #[test]
    fn git_error_is_returned_in_payload() {
        let result = compare_version(
            "abc123".to_owned(),
            false,
            Err("git is unavailable".to_owned()),
        );

        assert!(!result.behind);
        assert_eq!(result.repo_head, None);
        assert_eq!(result.error.as_deref(), Some("git is unavailable"));
    }

    #[test]
    fn resolves_release_repo_root_relative_to_executable() {
        let root = repo_root_for_exe(
            Path::new(r"A:\repo\src-tauri\target\release\pdf-editor.exe"),
            None,
        )
        .unwrap();

        assert_eq!(root, Path::new(r"A:\repo"));
    }

    #[test]
    fn resolves_dev_repo_root_from_manifest_dir() {
        let root = repo_root_for_exe(
            Path::new(r"C:\unrelated\target\debug\pdf-editor.exe"),
            Some(Path::new(r"A:\repo\src-tauri")),
        )
        .unwrap();

        assert_eq!(root, Path::new(r"A:\repo"));
    }
}
