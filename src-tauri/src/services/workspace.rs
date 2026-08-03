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
    // RUSTSEC-2026-0187 is handled inside LopdfReader::open, which goes
    // through pdf_guard::load_guarded. An explicit guard_path call stood here
    // first, before the sweep covered every load site, and once the sweep
    // landed it made this path read and scan the whole file TWICE for no
    // added protection. Removed rather than kept "for safety": a redundant
    // check that costs a second full read of every opened document is a cost,
    // not a belt.
    let reader = LopdfReader::open(path).map_err(|e| AppError::PdfCorrupted {
        // `{e:#}`, not `{e}`. This is an `anyhow::Error`, and its plain Display
            // prints ONLY the outermost context — here `format!("load {}", path)`
            // from LopdfReader::open. So the whole reason a hostile file was
            // refused (nesting depth, the 256 limit, the advisory id) was being
            // thrown away and the user was shown a bare path. The `{detail}`
            // placeholder added to errors.json interpolated nothing useful.
            // The alternate selector walks the full context chain.
            detail: format!("{e:#}"),
    })?;
    Ok(OpenedDocument {
        path: path.display().to_string(),
        page_count: reader.page_count(),
        metadata: reader.metadata(),
        is_encrypted: reader.is_encrypted(),
        size_bytes: std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
    })
}
