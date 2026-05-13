// Workspace document inspection. Synchronous because lopdf does blocking I/O;
// commands wrap us in `spawn_blocking`. Returns an `OpenedDocument` snapshot
// the frontend uses to populate the workspace shell (page count drives the
// thumbnail strip, metadata feeds the inspector, `is_encrypted` triggers the
// unlock flow before render).
use crate::error::{AppError, AppResult};
use crate::services::pdf_reader::{LopdfReader, PdfMetadata, PdfReader};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OpenedDocument {
    pub path: String,
    pub page_count: usize,
    pub metadata: PdfMetadata,
    pub is_encrypted: bool,
    pub size_bytes: u64,
}

pub fn inspect_document(path: &Path) -> AppResult<OpenedDocument> {
    if !path.exists() {
        return Err(AppError::FileNotFound {
            path: path.display().to_string(),
        });
    }
    let reader = LopdfReader::open(path).map_err(|e| AppError::PdfCorrupted {
        detail: e.to_string(),
    })?;
    Ok(OpenedDocument {
        path: path.display().to_string(),
        page_count: reader.page_count(),
        metadata: reader.metadata(),
        is_encrypted: reader.is_encrypted(),
        size_bytes: std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
    })
}
