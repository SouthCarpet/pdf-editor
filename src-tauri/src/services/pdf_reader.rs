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
        let doc = Document::load(path).with_context(|| format!("load {}", path.display()))?;
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
        self.doc.is_encrypted()
    }
}
