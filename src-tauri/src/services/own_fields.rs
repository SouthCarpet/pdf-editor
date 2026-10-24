// Plan 119 O1: own form fields. A field the user draws on a page is saved
// as one merged field-and-widget object and registered in the page
// `/Annots` (by `save_annotations`) and in the catalog `/AcroForm /Fields`.
// Rules: plan 119 rest, section 2.2, writer rules 1 to 9.
use anyhow::{bail, Context, Result};
use lopdf::{
    decode_text_string, dictionary, text_string, Dictionary, Document, Object, ObjectId, Stream,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Rule 6.
pub const RECT_ERROR: &str = "own field rect must be finite and at least 4 x 4 pt";
const MIN_SIDE_PT: f32 = 4.0;
const MAX_NAME_CHARS: usize = 128;
const DEFAULT_NAME: &str = "Field";
/// Text field flag bit 13 (`Multiline`).
const MULTILINE_FLAG: i64 = 1 << 12;
/// Annotation flag bit 3 (`Print`).
const PRINT_FLAG: i64 = 4;
const BORDER_GRAY: f32 = 0.4;
const BORDER_WIDTH: f32 = 0.5;
const DEFAULT_APPEARANCE: &str = "/Helv 0 Tf 0 g";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum OwnFieldKind {
    Text,
    Checkbox,
}

/// One own field as `save_annotations` passes it.
pub(crate) struct OwnField<'a> {
    pub rect: [f32; 4],
    pub name: &'a str,
    pub kind: OwnFieldKind,
    pub multiline: bool,
    pub font_size: f32,
}

/// Rule N: remove control characters, replace every `.` with `_` (a dot
/// separates the parts of a fully qualified name), trim, cut to 128
/// characters; an empty result becomes `Field`.
pub fn sanitize_field_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|character| !character.is_control())
        .map(|character| if character == '.' { '_' } else { character })
        .collect();
    let cut: String = cleaned.trim().chars().take(MAX_NAME_CHARS).collect();
    if cut.is_empty() {
        DEFAULT_NAME.to_string()
    } else {
        cut
    }
}

/// The fully qualified names a new top-level field can collide with. A
/// sanitized name has no dot, so only names reachable from `/Fields`
/// without a named ancestor matter.
pub(crate) struct FieldNames(HashSet<String>);

impl FieldNames {
    pub(crate) fn of(doc: &Document) -> Self {
        let mut names = HashSet::new();
        let mut visited = HashSet::new();
        for id in acroform(doc).map_or_else(Vec::new, |form| references(doc, form, b"Fields")) {
            collect_top_level_name(doc, id, &mut names, &mut visited);
        }
        Self(names)
    }

    /// Rule 4: the sanitized name, or the first free `<name>_2`, `<name>_3`.
    fn claim(&mut self, requested: &str) -> String {
        let base = sanitize_field_name(requested);
        let mut name = base.clone();
        let mut suffix = 2;
        while self.0.contains(&name) {
            name = format!("{base}_{suffix}");
            suffix += 1;
        }
        self.0.insert(name.clone());
        name
    }
}

fn collect_top_level_name(
    doc: &Document,
    id: ObjectId,
    names: &mut HashSet<String>,
    visited: &mut HashSet<ObjectId>,
) {
    if !visited.insert(id) {
        return;
    }
    let Ok(node) = doc.get_dictionary(id) else {
        return;
    };
    if let Some(name) = node.get(b"T").ok().and_then(|t| decode_text_string(t).ok()) {
        names.insert(name);
        return;
    }
    for kid in references(doc, node, b"Kids") {
        collect_top_level_name(doc, kid, names, visited);
    }
}

/// Writes one own field and returns its widget object (rule 7). The caller
/// adds the id to the page `/Annots`.
pub(crate) fn write_own_field(
    doc: &mut Document,
    page_id: ObjectId,
    field: &OwnField<'_>,
    names: &mut FieldNames,
) -> Result<ObjectId> {
    validate_rect(&field.rect)?;
    ensure_acroform(doc)?;
    let name = names.claim(field.name);
    let mut widget = widget_dict(field, &name, page_id, page_rotation(doc, page_id));
    add_appearance(doc, &mut widget, field);
    let id = doc.add_object(widget);
    with_fields(doc, |fields| fields.push(Object::Reference(id)));
    Ok(id)
}

/// Rule 9: drops each id from the top level of `/AcroForm /Fields`, so a
/// replaced or deleted own field leaves no dangling reference. `/AcroForm`
/// stays when `/Fields` becomes empty.
pub(crate) fn remove_from_fields(doc: &mut Document, ids: &HashSet<ObjectId>) {
    with_fields(doc, |fields| {
        fields.retain(|field| !matches!(field, Object::Reference(id) if ids.contains(id)));
    });
}

fn validate_rect(rect: &[f32; 4]) -> Result<()> {
    let finite = rect.iter().all(|value| value.is_finite());
    let (width, height) = rect_size(rect);
    if !finite || width < MIN_SIDE_PT || height < MIN_SIDE_PT {
        bail!(RECT_ERROR);
    }
    Ok(())
}

fn rect_size(rect: &[f32; 4]) -> (f32, f32) {
    ((rect[2] - rect[0]).abs(), (rect[3] - rect[1]).abs())
}

/// Rule 1 and rule 5.
fn widget_dict(field: &OwnField<'_>, name: &str, page_id: ObjectId, rotation: i64) -> Dictionary {
    let (field_type, flags) = match field.kind {
        OwnFieldKind::Text if field.multiline => ("Tx", MULTILINE_FLAG),
        OwnFieldKind::Text => ("Tx", 0),
        OwnFieldKind::Checkbox => ("Btn", 0),
    };
    let gray = Object::Real(BORDER_GRAY);
    dictionary! {
        "Type" => "Annot",
        "Subtype" => "Widget",
        "FT" => field_type,
        "T" => text_string(name),
        "Rect" => field.rect.iter().map(|value| Object::Real(*value)).collect::<Vec<_>>(),
        "P" => Object::Reference(page_id),
        "F" => PRINT_FLAG,
        "Ff" => flags,
        "DA" => Object::string_literal(field_appearance(field.font_size)),
        "MK" => dictionary! {
            "BC" => vec![gray.clone(), gray.clone(), gray],
            "R" => rotation,
        },
        "BS" => dictionary! { "W" => Object::Real(BORDER_WIDTH), "S" => "S" },
    }
}

fn field_appearance(font_size: f32) -> String {
    let size = if font_size.is_finite() && font_size > 0.0 {
        font_size
    } else {
        0.0
    };
    format!("/Helv {size} Tf 0 g")
}

/// The page `/Rotate`, inherited from a `/Pages` node when the page has
/// none, as 0, 90, 180 or 270.
fn page_rotation(doc: &Document, page_id: ObjectId) -> i64 {
    let mut node = doc.get_dictionary(page_id).ok();
    let mut visited = HashSet::new();
    while let Some(dict) = node {
        if let Ok(rotate) = dict.get(b"Rotate").and_then(Object::as_i64) {
            return rotate.rem_euclid(360);
        }
        node = dict
            .get(b"Parent")
            .and_then(Object::as_reference)
            .ok()
            .filter(|parent| visited.insert(*parent))
            .and_then(|parent| doc.get_dictionary(parent).ok());
    }
    0
}

/// Rule 3: an empty text field shows its border only; a checkbox gets the
/// states `/Off` and `/Yes` and starts at `/Off`.
fn add_appearance(doc: &mut Document, widget: &mut Dictionary, field: &OwnField<'_>) {
    let (width, height) = rect_size(&field.rect);
    let border = border_operators(width, height);
    let normal = match field.kind {
        OwnFieldKind::Text => {
            let content = format!("{border}/Tx BMC EMC\n");
            Object::Reference(doc.add_object(form_xobject(width, height, content)))
        }
        OwnFieldKind::Checkbox => {
            let checked = format!("{border}{}", check_mark(width, height));
            let off = doc.add_object(form_xobject(width, height, border));
            let yes = doc.add_object(form_xobject(width, height, checked));
            widget.set("AS", "Off");
            Object::Dictionary(dictionary! {
                "Off" => Object::Reference(off),
                "Yes" => Object::Reference(yes),
            })
        }
    };
    widget.set("AP", dictionary! { "N" => normal });
}

fn border_operators(width: f32, height: f32) -> String {
    let inset = BORDER_WIDTH / 2.0;
    format!(
        "q {BORDER_GRAY} {BORDER_GRAY} {BORDER_GRAY} RG {BORDER_WIDTH} w {inset} {inset} {} {} re S Q\n",
        width - BORDER_WIDTH,
        height - BORDER_WIDTH
    )
}

fn check_mark(width: f32, height: f32) -> String {
    let line = width.min(height) * 0.12;
    format!(
        "q 0 G {line} w 1 J 1 j {} {} m {} {} l {} {} l S Q\n",
        width * 0.2,
        height * 0.5,
        width * 0.42,
        height * 0.25,
        width * 0.8,
        height * 0.8
    )
}

fn form_xobject(width: f32, height: f32, content: String) -> Stream {
    let bbox = vec![
        Object::Integer(0),
        Object::Integer(0),
        Object::Real(width),
        Object::Real(height),
    ];
    Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "BBox" => bbox,
            "Resources" => dictionary! {},
        },
        content.into_bytes(),
    )
}

/// Rule 2: creates `/AcroForm` when the catalog has none, and gives it a
/// default appearance and a `/Helv` font resource when they are missing.
fn ensure_acroform(doc: &mut Document) -> Result<()> {
    if acroform_mut(doc).is_none() {
        let root = catalog_id(doc).context("PDF catalog is missing")?;
        let form_id = doc.add_object(dictionary! { "Fields" => Vec::<Object>::new() });
        doc.get_dictionary_mut(root)
            .context("PDF catalog is not a dictionary")?
            .set("AcroForm", Object::Reference(form_id));
    }
    let form = acroform_mut(doc).context("AcroForm is not a dictionary")?;
    if !form.has(b"DA") {
        form.set("DA", Object::string_literal(DEFAULT_APPEARANCE));
    }
    ensure_helvetica_resource(form);
    Ok(())
}

/// Adds `/DR /Font /Helv` to a direct `/DR`. An indirect `/DR` or `/Font`
/// stays as it is.
fn ensure_helvetica_resource(form: &mut Dictionary) {
    if !form.has(b"DR") {
        form.set(
            "DR",
            dictionary! { "Font" => dictionary! { "Helv" => helvetica() } },
        );
        return;
    }
    let Ok(Object::Dictionary(resources)) = form.get_mut(b"DR") else {
        return;
    };
    if !resources.has(b"Font") {
        resources.set("Font", dictionary! { "Helv" => helvetica() });
        return;
    }
    if let Ok(Object::Dictionary(fonts)) = resources.get_mut(b"Font") {
        if !fonts.has(b"Helv") {
            fonts.set("Helv", helvetica());
        }
    }
}

fn helvetica() -> Dictionary {
    dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    }
}

fn catalog_id(doc: &Document) -> Option<ObjectId> {
    doc.trailer.get(b"Root").and_then(Object::as_reference).ok()
}

fn acroform(doc: &Document) -> Option<&Dictionary> {
    let catalog = doc.get_dictionary(catalog_id(doc)?).ok()?;
    resolve(doc, catalog.get(b"AcroForm").ok()?)?.as_dict().ok()
}

/// The `/AcroForm` dictionary, direct in the catalog or an indirect object.
fn acroform_mut(doc: &mut Document) -> Option<&mut Dictionary> {
    let root = catalog_id(doc)?;
    let entry = doc.get_dictionary(root).ok()?.get(b"AcroForm").ok()?;
    match entry.as_reference().ok() {
        Some(id) => doc.get_dictionary_mut(id).ok(),
        None => doc
            .get_dictionary_mut(root)
            .ok()?
            .get_mut(b"AcroForm")
            .ok()?
            .as_dict_mut()
            .ok(),
    }
}

/// Runs `edit` on the `/AcroForm /Fields` array: an indirect array object in
/// place, a direct array in the AcroForm. A missing `/Fields` starts empty
/// and is set only when `edit` leaves an entry. No AcroForm: nothing to do.
fn with_fields(doc: &mut Document, edit: impl FnOnce(&mut Vec<Object>)) {
    let Some(form) = acroform_mut(doc) else {
        return;
    };
    let indirect = form.get(b"Fields").and_then(Object::as_reference).ok();
    if let Some(Object::Array(fields)) = indirect.and_then(|id| doc.objects.get_mut(&id)) {
        edit(fields);
        return;
    }
    let Some(form) = acroform_mut(doc) else {
        return;
    };
    if let Ok(Object::Array(fields)) = form.get_mut(b"Fields") {
        edit(fields);
        return;
    }
    let mut fields = Vec::new();
    edit(&mut fields);
    if !fields.is_empty() {
        form.set("Fields", fields);
    }
}

fn resolve<'a>(doc: &'a Document, value: &'a Object) -> Option<&'a Object> {
    match value {
        Object::Reference(id) => doc.get_object(*id).ok(),
        other => Some(other),
    }
}

fn references(doc: &Document, dict: &Dictionary, key: &[u8]) -> Vec<ObjectId> {
    dict.get(key)
        .ok()
        .and_then(|value| resolve(doc, value))
        .and_then(|value| value.as_array().ok())
        .map_or_else(Vec::new, |array| {
            array
                .iter()
                .filter_map(|entry| entry.as_reference().ok())
                .collect()
        })
}
