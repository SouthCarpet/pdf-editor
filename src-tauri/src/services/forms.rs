// Phase 12 Task 66 — AcroForm read/fill service.
//
// Walks every object in the loaded PDF and collects `/Annot /Widget` form
// fields, exposing them as `FormField` records. `set_form_values` mutates
// the matched widgets' `/V` entries and clears `/AP` so a future
// viewer regenerates the appearance.
//
// TODO: auto-detect flat forms heuristic (Phase 12+ extension) — scan page
// text and line objects to propose fillable boxes for non-AcroForm PDFs.

use anyhow::{Context, Result};
use lopdf::{Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FormField {
    pub name: String,
    pub kind: FormFieldKind,
    pub value: Option<String>,
    pub page_index: u32,
    /// `[x, y, x2, y2]` in PDF points, as authored in `/Rect`.
    pub rect: [f32; 4],
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum FormFieldKind {
    Text,
    Checkbox,
    Radio,
    Choice,
    Signature,
}

fn obj_to_string(obj: &Object) -> String {
    match obj {
        Object::String(s, _) => String::from_utf8_lossy(s).to_string(),
        _ => String::new(),
    }
}

pub fn read_form_fields(path: &Path) -> Result<Vec<FormField>> {
    let doc = Document::load(path).context("load")?;
    let mut fields = Vec::new();

    // Map page-object-id -> zero-based page index. `get_pages()` returns 1-based.
    let pages: HashMap<ObjectId, u32> = doc
        .get_pages()
        .into_iter()
        .map(|(n, id)| (id, n.saturating_sub(1)))
        .collect();

    for (_id, obj) in &doc.objects {
        let Object::Dictionary(d) = obj else { continue };

        let is_annot = d
            .get(b"Type")
            .ok()
            .and_then(|o| o.as_name_str().ok())
            .map(|s| s == "Annot")
            .unwrap_or(false);
        let is_widget = d
            .get(b"Subtype")
            .ok()
            .and_then(|o| o.as_name_str().ok())
            .map(|s| s == "Widget")
            .unwrap_or(false);
        if !(is_annot && is_widget) {
            continue;
        }

        let name = d.get(b"T").map(obj_to_string).unwrap_or_default();
        let kind_name = d
            .get(b"FT")
            .ok()
            .and_then(|o| o.as_name_str().ok())
            .unwrap_or("Tx");
        let kind = match kind_name {
            "Tx" => FormFieldKind::Text,
            "Btn" => FormFieldKind::Checkbox,
            "Ch" => FormFieldKind::Choice,
            "Sig" => FormFieldKind::Signature,
            _ => FormFieldKind::Text,
        };
        let value = d.get(b"V").ok().and_then(|o| match o {
            Object::String(s, _) => Some(String::from_utf8_lossy(s).to_string()),
            Object::Name(s) => Some(String::from_utf8_lossy(s).to_string()),
            _ => None,
        });
        let rect: [f32; 4] = d
            .get(b"Rect")
            .ok()
            .map(|o| match o {
                Object::Array(a) if a.len() == 4 => {
                    let mut out = [0.0f32; 4];
                    for (i, item) in a.iter().enumerate() {
                        out[i] = match item {
                            Object::Real(f) => *f,
                            Object::Integer(n) => *n as f32,
                            _ => 0.0,
                        };
                    }
                    out
                }
                _ => [0.0; 4],
            })
            .unwrap_or([0.0; 4]);
        let parent_page = d
            .get(b"P")
            .ok()
            .and_then(|o| o.as_reference().ok())
            .and_then(|pid| pages.get(&pid).copied())
            .unwrap_or(0);

        fields.push(FormField {
            name,
            kind,
            value,
            page_index: parent_page,
            rect,
            options: Vec::new(),
        });
    }

    Ok(fields)
}

pub fn set_form_values(
    input: &Path,
    output: &Path,
    values: &HashMap<String, String>,
) -> Result<()> {
    let mut doc = Document::load(input).context("load")?;

    // Collect first to avoid borrow-checker fights with `doc.objects`.
    let mut updates: Vec<(ObjectId, String)> = Vec::new();
    for (id, obj) in &doc.objects {
        let Object::Dictionary(d) = obj else { continue };
        let is_widget = d
            .get(b"Subtype")
            .ok()
            .and_then(|o| o.as_name_str().ok())
            .map(|s| s == "Widget")
            .unwrap_or(false);
        if !is_widget {
            continue;
        }
        let name = d.get(b"T").map(obj_to_string).unwrap_or_default();
        if let Some(v) = values.get(&name) {
            updates.push((*id, v.clone()));
        }
    }

    for (id, v) in updates {
        if let Some(obj) = doc.objects.get_mut(&id) {
            if let Ok(d) = obj.as_dict_mut() {
                d.set("V", Object::string_literal(v.clone()));
                // Force the viewer to regenerate the appearance from /V.
                d.set("AP", Object::Null);
            }
        }
    }

    doc.compress();
    doc.save(output).context("save")?;
    Ok(())
}
