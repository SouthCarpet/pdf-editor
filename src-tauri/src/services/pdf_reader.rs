use anyhow::{Context, Result};
use lopdf::{Document, Object};
use std::path::Path;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct PdfMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
}

pub trait PdfReader {
    fn page_count(&self) -> usize;
    fn metadata(&self) -> PdfMetadata;
    fn is_encrypted(&self) -> bool;
}

pub struct LopdfReader {
    pub doc: Document,
}

impl LopdfReader {
    pub fn open(path: &Path) -> Result<Self> {
        let doc = crate::services::pdf_guard::load_guarded(path)
            .with_context(|| format!("load {}", path.display()))?;
        Ok(Self { doc })
    }

    fn info_string(&self, key: &[u8]) -> Option<String> {
        let info_id = match self.doc.trailer.get(b"Info").ok()? {
            Object::Reference(r) => *r,
            _ => return None,
        };
        let info = self.doc.objects.get(&info_id)?.as_dict().ok()?;
        match info.get(key).ok()? {
            Object::String(s, _) => String::from_utf8(s.clone()).ok(),
            _ => None,
        }
    }
}

impl PdfReader for LopdfReader {
    fn page_count(&self) -> usize {
        self.doc.get_pages().len()
    }

    fn metadata(&self) -> PdfMetadata {
        PdfMetadata {
            title: self.info_string(b"Title"),
            author: self.info_string(b"Author"),
            subject: self.info_string(b"Subject"),
            keywords: self.info_string(b"Keywords"),
            creator: self.info_string(b"Creator"),
            producer: self.info_string(b"Producer"),
        }
    }

    fn is_encrypted(&self) -> bool {
        // The union, and the `was_` half is the one that matters.
        //
        // lopdf 0.44 auto-decrypts a document whose USER password is empty and
        // then clears `/Encrypt` from the in-memory trailer. A permission-lock
        // (empty user password, real owner password) therefore answers `false`
        // to `is_encrypted()`, where lopdf 0.34 answered `true`. The upgrade
        // that closed RUSTSEC-2026-0187 changed this silently, and it decides
        // whether the unlock flow runs at all.
        //
        // Measured on this project's own `password-permission.pdf` fixture and
        // pinned by tests/encryption_detection_test.rs, so a future bump that
        // moves it back cannot do so quietly.
        //
        // NOT FIXED HERE, and deliberately so: `Document::save` writes what is
        // in memory, and `/Encrypt` is no longer in it, so every load-then-save
        // path in this crate strips the owner password and its permission
        // restrictions from such a file. Preserving that through an edit means
        // re-encrypting via qpdf on the way out, which is a product decision
        // rather than a bug fix. Detection is corrected now because it is
        // unambiguous; the save side is recorded and left visible.
        self.doc.is_encrypted() || self.doc.was_encrypted()
    }
}
