use std::path::{Path, PathBuf};

pub const OPEN_PATHS_EVENT: &str = "open-paths";

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}

pub fn pdf_paths_from_args<I, S>(args: I, working_directory: &Path) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .filter_map(|argument| {
            let argument = argument.as_ref();
            if argument.starts_with('-') {
                return None;
            }
            let path = PathBuf::from(argument);
            let resolved = if path.is_absolute() {
                path
            } else {
                working_directory.join(path)
            };
            (is_pdf(&resolved) && resolved.is_file())
                .then(|| resolved.to_string_lossy().into_owned())
        })
        .collect()
}

#[tauri::command]
#[specta::specta]
pub fn startup_paths() -> Vec<String> {
    let working_directory = std::env::current_dir().unwrap_or_default();
    pdf_paths_from_args(std::env::args(), &working_directory)
}

#[cfg(test)]
mod tests {
    use super::pdf_paths_from_args;
    use std::fs;

    #[test]
    fn argv_parser_ignores_flags_and_keeps_only_existing_pdf_paths() {
        let directory = tempfile::tempdir().expect("create isolated argument fixture");
        fs::write(directory.path().join("form.PDF"), b"pdf").expect("write PDF fixture");
        fs::write(directory.path().join("notes.txt"), b"text").expect("write text fixture");

        let paths = pdf_paths_from_args(
            [
                "pdf-editor.exe",
                "--verbose",
                "form.PDF",
                "notes.txt",
                "missing.pdf",
            ],
            directory.path(),
        );

        assert_eq!(
            paths,
            vec![directory
                .path()
                .join("form.PDF")
                .to_string_lossy()
                .into_owned()],
            "the command-line contract keeps only existing PDF arguments",
        );
    }
}
