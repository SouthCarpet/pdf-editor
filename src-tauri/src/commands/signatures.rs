use crate::error::{AppError, AppResult};
use image::ImageFormat;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const MAX_SIGNATURE_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_SIGNATURE_DIMENSION: u32 = 4096;

const INDEX_FILE: &str = "index.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct SignatureRecord {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SignatureIndex {
    signatures: Vec<SignatureIndexEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SignatureIndexEntry {
    id: String,
    name: String,
    width: u32,
    height: u32,
}

fn invalid(detail: impl Into<String>) -> AppError {
    AppError::InvalidArgument {
        detail: detail.into(),
    }
}

fn io_error(detail: impl Into<String>) -> AppError {
    AppError::IoError {
        detail: detail.into(),
    }
}

fn signature_directory(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("signatures"))
        .map_err(|error| io_error(format!("could not resolve app data directory: {error}")))
}

fn normalize_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(invalid("signature name must not be empty"));
    }
    Ok(name.to_owned())
}

fn load_index(directory: &Path) -> AppResult<SignatureIndex> {
    let path = directory.join(INDEX_FILE);
    if !path.exists() {
        return Ok(SignatureIndex::default());
    }
    let bytes = std::fs::read(&path)
        .map_err(|error| io_error(format!("could not read {}: {error}", path.display())))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| io_error(format!("could not parse {}: {error}", path.display())))
}

fn save_index(directory: &Path, index: &SignatureIndex) -> AppResult<()> {
    std::fs::create_dir_all(directory).map_err(|error| {
        io_error(format!(
            "could not create signature directory {}: {error}",
            directory.display()
        ))
    })?;
    let path = directory.join(INDEX_FILE);
    let bytes = serde_json::to_vec_pretty(index)
        .map_err(|error| io_error(format!("could not encode signature index: {error}")))?;
    std::fs::write(&path, bytes)
        .map_err(|error| io_error(format!("could not write {}: {error}", path.display())))
}

fn record(directory: &Path, entry: &SignatureIndexEntry) -> SignatureRecord {
    SignatureRecord {
        id: entry.id.clone(),
        name: entry.name.clone(),
        file_path: directory
            .join(format!("{}.png", entry.id))
            .to_string_lossy()
            .into_owned(),
        width: entry.width,
        height: entry.height,
    }
}

fn list_from(directory: &Path) -> AppResult<Vec<SignatureRecord>> {
    let index = load_index(directory)?;
    Ok(index
        .signatures
        .iter()
        .map(|entry| record(directory, entry))
        .collect())
}

fn validate_png(bytes: &[u8]) -> AppResult<(u32, u32)> {
    if bytes.len() > MAX_SIGNATURE_BYTES {
        return Err(invalid(format!(
            "signature PNG exceeds the {} byte limit",
            MAX_SIGNATURE_BYTES
        )));
    }
    if !matches!(image::guess_format(bytes), Ok(ImageFormat::Png)) {
        return Err(invalid("signature image must be a PNG"));
    }
    let image = image::load_from_memory_with_format(bytes, ImageFormat::Png)
        .map_err(|error| invalid(format!("signature PNG could not be decoded: {error}")))?;
    let (width, height) = (image.width(), image.height());
    if width > MAX_SIGNATURE_DIMENSION || height > MAX_SIGNATURE_DIMENSION {
        return Err(invalid(format!(
            "signature PNG exceeds {} x {} pixels",
            MAX_SIGNATURE_DIMENSION, MAX_SIGNATURE_DIMENSION
        )));
    }
    Ok((width, height))
}

fn signature_id(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mut prefix = String::with_capacity(16);
    for byte in &digest[..8] {
        let _ = write!(prefix, "{byte:02x}");
    }
    format!("{timestamp}-{prefix}")
}

fn create_from_bytes(directory: &Path, bytes: &[u8], name: &str) -> AppResult<SignatureRecord> {
    let name = normalize_name(name)?;
    let (width, height) = validate_png(bytes)?;
    std::fs::create_dir_all(directory).map_err(|error| {
        io_error(format!(
            "could not create signature directory {}: {error}",
            directory.display()
        ))
    })?;

    let mut index = load_index(directory)?;
    let base_id = signature_id(bytes);
    let mut id = base_id.clone();
    let mut suffix = 2;
    while directory.join(format!("{id}.png")).exists() {
        id = format!("{base_id}-{suffix}");
        suffix += 1;
    }
    let path = directory.join(format!("{id}.png"));
    std::fs::write(&path, bytes)
        .map_err(|error| io_error(format!("could not write {}: {error}", path.display())))?;
    let entry = SignatureIndexEntry {
        id,
        name,
        width,
        height,
    };
    index.signatures.insert(0, entry.clone());
    if let Err(error) = save_index(directory, &index) {
        let _ = std::fs::remove_file(path);
        return Err(error);
    }
    Ok(record(directory, &entry))
}

fn import_from(directory: &Path, path: &Path) -> AppResult<SignatureRecord> {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("png"))
    {
        return Err(invalid("signature import accepts PNG files only"));
    }
    let bytes = std::fs::read(path)
        .map_err(|error| io_error(format!("could not read {}: {error}", path.display())))?;
    let name = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Signature");
    create_from_bytes(directory, &bytes, name)
}

fn rename_in(directory: &Path, id: &str, name: &str) -> AppResult<SignatureRecord> {
    let name = normalize_name(name)?;
    let mut index = load_index(directory)?;
    let entry = index
        .signatures
        .iter_mut()
        .find(|entry| entry.id == id)
        .ok_or_else(|| invalid("signature was not found"))?;
    entry.name = name;
    let updated = entry.clone();
    save_index(directory, &index)?;
    Ok(record(directory, &updated))
}

fn delete_from(directory: &Path, id: &str) -> AppResult<()> {
    let mut index = load_index(directory)?;
    let position = index
        .signatures
        .iter()
        .position(|entry| entry.id == id)
        .ok_or_else(|| invalid("signature was not found"))?;
    let entry = index.signatures.remove(position);
    let path = directory.join(format!("{}.png", entry.id));
    match std::fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(io_error(format!(
                "could not delete {}: {error}",
                path.display()
            )))
        }
    }
    save_index(directory, &index)
}

#[tauri::command]
#[specta::specta]
pub fn signature_list(app: AppHandle) -> AppResult<Vec<SignatureRecord>> {
    list_from(&signature_directory(&app)?)
}

#[tauri::command]
#[specta::specta]
pub fn signature_import(app: AppHandle, path: String) -> AppResult<SignatureRecord> {
    import_from(&signature_directory(&app)?, Path::new(&path))
}

#[tauri::command]
#[specta::specta]
pub fn signature_create_from_png_bytes(
    app: AppHandle,
    bytes: Vec<u8>,
    name: String,
) -> AppResult<SignatureRecord> {
    create_from_bytes(&signature_directory(&app)?, &bytes, &name)
}

#[tauri::command]
#[specta::specta]
pub fn signature_rename(app: AppHandle, id: String, name: String) -> AppResult<SignatureRecord> {
    rename_in(&signature_directory(&app)?, &id, &name)
}

#[tauri::command]
#[specta::specta]
pub fn signature_delete(app: AppHandle, id: String) -> AppResult<()> {
    delete_from(&signature_directory(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(width, height, image::Rgba([0, 0, 255, 80]));
        let mut bytes = std::io::Cursor::new(Vec::new());
        image
            .write_to(&mut bytes, ImageFormat::Png)
            .expect("encode PNG fixture");
        bytes.into_inner()
    }

    #[test]
    fn create_list_rename_delete_preserves_png_and_index_state() {
        let directory = tempfile::tempdir().expect("create isolated signature library");
        let created = create_from_bytes(directory.path(), &png(20, 10), "Môj podpis")
            .expect("create signature");

        assert_eq!(created.name, "Môj podpis");
        assert_eq!((created.width, created.height), (20, 10));
        assert!(Path::new(&created.file_path).is_file());
        assert!(directory.path().join(INDEX_FILE).is_file());
        assert_eq!(
            list_from(directory.path()).expect("list signatures").len(),
            1
        );

        let renamed =
            rename_in(directory.path(), &created.id, "Faktúry").expect("rename signature");
        assert_eq!(renamed.name, "Faktúry");
        assert_eq!(
            list_from(directory.path()).expect("list renamed signatures")[0].name,
            "Faktúry"
        );

        delete_from(directory.path(), &created.id).expect("delete signature");
        assert!(list_from(directory.path())
            .expect("list empty library")
            .is_empty());
        assert!(!Path::new(&created.file_path).exists());
    }

    #[test]
    fn import_rejects_non_png_extension_without_changing_library() {
        let directory = tempfile::tempdir().expect("create isolated signature library");
        let source = directory.path().join("signature.jpg");
        std::fs::write(&source, png(2, 2)).expect("write disguised PNG fixture");

        let error = import_from(directory.path(), &source).expect_err("JPG import must fail");

        assert!(matches!(error, AppError::InvalidArgument { .. }));
        assert!(list_from(directory.path())
            .expect("list unchanged library")
            .is_empty());
    }

    #[test]
    fn create_rejects_images_above_dimension_limit_without_writing_index() {
        let directory = tempfile::tempdir().expect("create isolated signature library");
        let oversized = png(MAX_SIGNATURE_DIMENSION + 1, 1);

        let error = create_from_bytes(directory.path(), &oversized, "Too wide")
            .expect_err("oversized PNG must fail");

        assert!(matches!(error, AppError::InvalidArgument { .. }));
        assert!(!directory.path().join(INDEX_FILE).exists());
    }

    #[test]
    fn create_rejects_payload_above_byte_limit_before_decoding() {
        let directory = tempfile::tempdir().expect("create isolated signature library");
        let oversized = vec![0; MAX_SIGNATURE_BYTES + 1];

        let error = create_from_bytes(directory.path(), &oversized, "Too large")
            .expect_err("oversized payload must fail");

        assert!(matches!(error, AppError::InvalidArgument { .. }));
        assert!(!directory.path().join(INDEX_FILE).exists());
    }
}
