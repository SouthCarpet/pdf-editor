// AcroForm read and fill service.
//
// The AcroForm field tree owns field metadata and values. Widget annotations
// often contain only page placement plus a /Parent reference, so scanning
// widgets in isolation is not sufficient.

use anyhow::{bail, Context, Result};
use lopdf::{decode_text_string, text_string, Dictionary, Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

const FIELD_FLAG_READ_ONLY: u32 = 1 << 0;
const FIELD_FLAG_REQUIRED: u32 = 1 << 1;
const BUTTON_FLAG_RADIO: u32 = 1 << 15;
const BUTTON_FLAG_PUSHBUTTON: u32 = 1 << 16;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct FormField {
    /// Indirect object reference encoded as `object:generation`.
    pub id: String,
    pub name: String,
    pub kind: FormFieldKind,
    pub value: Option<String>,
    pub page_index: Option<u32>,
    /// `[x1, y1, x2, y2]` in PDF points, as authored in `/Rect`.
    pub rect: [f32; 4],
    pub options: Vec<String>,
    pub read_only: bool,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum FormFieldKind {
    Text,
    Checkbox,
    Radio,
    Choice,
    Signature,
    Button,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct FormValueUpdate {
    pub field_id: String,
    /// `None` clears the field by removing `/V`.
    pub value: Option<String>,
}

#[derive(Clone, Default)]
struct InheritedField {
    name_parts: Vec<String>,
    field_type: Option<String>,
    value: Option<Object>,
    flags: u32,
    options: Vec<String>,
}

#[derive(Clone)]
struct FieldRecord {
    field: FormField,
    owner_id: ObjectId,
    widget_ids: Vec<ObjectId>,
}

pub fn read_form_fields(path: &Path) -> Result<Vec<FormField>> {
    validate_pdf_input(path)?;
    let doc = Document::load(path).context("load PDF form")?;
    Ok(collect_form_fields(&doc)?
        .into_iter()
        .map(|record| record.field)
        .collect())
}

pub fn set_form_values(input: &Path, output: &Path, updates: &[FormValueUpdate]) -> Result<()> {
    validate_pdf_input(input)?;
    validate_pdf_output(input, output)?;

    let mut doc = Document::load(input).context("load PDF form")?;
    let records = collect_form_fields(&doc)?;
    let by_id: HashMap<&str, &FieldRecord> = records
        .iter()
        .map(|record| (record.field.id.as_str(), record))
        .collect();
    let mut seen = HashSet::new();
    let mut needs_appearances = false;

    for update in updates {
        if !seen.insert(update.field_id.as_str()) {
            bail!("duplicate form update for field {}", update.field_id);
        }
        let record = by_id
            .get(update.field_id.as_str())
            .copied()
            .with_context(|| format!("form field {} not found", update.field_id))?;
        if record.field.read_only {
            bail!("form field {} is read-only", update.field_id);
        }
        if matches!(
            record.field.kind,
            FormFieldKind::Signature | FormFieldKind::Button
        ) {
            bail!("form field {} is not value-editable", update.field_id);
        }

        validate_update(record, update)?;
        write_field_value(&mut doc, record.owner_id, &record.field.kind, &update.value)?;

        match record.field.kind {
            FormFieldKind::Checkbox | FormFieldKind::Radio => {
                sync_button_widgets(&mut doc, record, update.value.as_deref())?;
            }
            FormFieldKind::Text | FormFieldKind::Choice => {
                invalidate_widget_appearances(&mut doc, &record.widget_ids)?;
                needs_appearances = true;
            }
            FormFieldKind::Signature | FormFieldKind::Button => unreachable!(),
        }
    }

    if needs_appearances {
        set_need_appearances(&mut doc)?;
    }
    doc.compress();
    doc.save(output)
        .with_context(|| format!("save filled PDF to {}", output.display()))?;
    Ok(())
}

fn collect_form_fields(doc: &Document) -> Result<Vec<FieldRecord>> {
    let field_roots = acroform_field_roots(doc)?;
    let page_by_widget = widget_page_map(doc);
    let page_by_object: HashMap<ObjectId, u32> = doc
        .get_pages()
        .into_iter()
        .map(|(page_number, id)| (id, page_number.saturating_sub(1)))
        .collect();
    let mut records = Vec::new();
    let mut visited = HashSet::new();

    for root_id in field_roots {
        walk_field(
            doc,
            root_id,
            &InheritedField::default(),
            &page_by_widget,
            &page_by_object,
            &mut visited,
            &mut records,
        )?;
    }

    records.sort_by(|left, right| {
        left.field
            .page_index
            .cmp(&right.field.page_index)
            .then_with(|| left.field.name.cmp(&right.field.name))
            .then_with(|| left.field.id.cmp(&right.field.id))
    });
    Ok(records)
}

#[allow(clippy::too_many_arguments)]
fn walk_field(
    doc: &Document,
    field_id: ObjectId,
    inherited: &InheritedField,
    page_by_widget: &HashMap<ObjectId, u32>,
    page_by_object: &HashMap<ObjectId, u32>,
    visited: &mut HashSet<ObjectId>,
    records: &mut Vec<FieldRecord>,
) -> Result<()> {
    if !visited.insert(field_id) {
        return Ok(());
    }
    let dict = doc
        .get_object(field_id)
        .with_context(|| format!("resolve AcroForm field {}", format_id(field_id)))?
        .as_dict()
        .with_context(|| format!("AcroForm field {} is not a dictionary", format_id(field_id)))?;

    let mut current = inherited.clone();
    if let Some(partial_name) = dict.get(b"T").ok().and_then(object_to_text) {
        current.name_parts.push(partial_name);
    }
    if let Some(field_type) = dict
        .get(b"FT")
        .ok()
        .and_then(|value| resolved_object(doc, value))
        .and_then(|value| value.as_name_str().ok())
    {
        current.field_type = Some(field_type.to_string());
    }
    if let Ok(value) = dict.get(b"V") {
        current.value = resolved_object(doc, value).cloned();
    }
    if let Some(flags) = dict
        .get(b"Ff")
        .ok()
        .and_then(|value| resolved_object(doc, value))
        .and_then(object_to_u32)
    {
        current.flags = flags;
    }
    if let Ok(options) = dict.get(b"Opt") {
        current.options = choice_options(doc, options);
    }

    let mut logical_children = Vec::new();
    let mut widget_ids = Vec::new();
    for child_id in child_references(doc, dict, b"Kids") {
        let child = match doc.get_object(child_id).ok().and_then(|o| o.as_dict().ok()) {
            Some(child) => child,
            None => continue,
        };
        let widget = is_widget(child);
        let declares_field = child.has(b"T") || child.has(b"FT");
        if widget && !declares_field {
            widget_ids.push(child_id);
        } else {
            logical_children.push(child_id);
        }
    }

    if !logical_children.is_empty() {
        for child_id in logical_children {
            walk_field(
                doc,
                child_id,
                &current,
                page_by_widget,
                page_by_object,
                visited,
                records,
            )?;
        }
        return Ok(());
    }

    let Some(field_type) = current.field_type.as_deref() else {
        return Ok(());
    };
    if is_widget(dict) {
        widget_ids.push(field_id);
    }
    let kind = classify_kind(field_type, current.flags);
    let mut options = if matches!(kind, FormFieldKind::Checkbox | FormFieldKind::Radio) {
        button_states(doc, &widget_ids)
    } else {
        current.options.clone()
    };
    options.sort();
    options.dedup();

    let (page_index, rect) =
        first_widget_location(doc, &widget_ids, page_by_widget, page_by_object);
    let name = current.name_parts.join(".");
    records.push(FieldRecord {
        field: FormField {
            id: format_id(field_id),
            name,
            kind,
            value: current.value.as_ref().and_then(object_to_value),
            page_index,
            rect,
            options,
            read_only: current.flags & FIELD_FLAG_READ_ONLY != 0,
            required: current.flags & FIELD_FLAG_REQUIRED != 0,
        },
        owner_id: field_id,
        widget_ids,
    });
    Ok(())
}

fn acroform_field_roots(doc: &Document) -> Result<Vec<ObjectId>> {
    let root_id = doc
        .trailer
        .get(b"Root")
        .context("PDF catalog is missing")?
        .as_reference()
        .context("PDF catalog is not indirect")?;
    let catalog = doc
        .get_object(root_id)
        .context("resolve PDF catalog")?
        .as_dict()
        .context("PDF catalog is not a dictionary")?;
    let Ok(acroform) = catalog.get(b"AcroForm") else {
        return Ok(Vec::new());
    };
    let Some(acroform) = resolved_object(doc, acroform) else {
        return Ok(Vec::new());
    };
    let Ok(acroform) = acroform.as_dict() else {
        return Ok(Vec::new());
    };
    Ok(child_references(doc, acroform, b"Fields"))
}

fn child_references(doc: &Document, dict: &Dictionary, key: &[u8]) -> Vec<ObjectId> {
    let Some(array) = dict
        .get(key)
        .ok()
        .and_then(|value| resolved_object(doc, value))
        .and_then(|value| value.as_array().ok())
    else {
        return Vec::new();
    };
    array
        .iter()
        .filter_map(|value| value.as_reference().ok())
        .collect()
}

fn resolved_object<'a>(doc: &'a Document, value: &'a Object) -> Option<&'a Object> {
    match value {
        Object::Reference(id) => doc.get_object(*id).ok(),
        other => Some(other),
    }
}

fn is_widget(dict: &Dictionary) -> bool {
    dict.get(b"Subtype")
        .ok()
        .and_then(|value| value.as_name_str().ok())
        .is_some_and(|name| name == "Widget")
}

fn classify_kind(field_type: &str, flags: u32) -> FormFieldKind {
    match field_type {
        "Btn" if flags & BUTTON_FLAG_PUSHBUTTON != 0 => FormFieldKind::Button,
        "Btn" if flags & BUTTON_FLAG_RADIO != 0 => FormFieldKind::Radio,
        "Btn" => FormFieldKind::Checkbox,
        "Ch" => FormFieldKind::Choice,
        "Sig" => FormFieldKind::Signature,
        _ => FormFieldKind::Text,
    }
}

fn object_to_u32(value: &Object) -> Option<u32> {
    match value {
        Object::Integer(value) => u32::try_from(*value).ok(),
        Object::Real(value) if *value >= 0.0 => Some(*value as u32),
        _ => None,
    }
}

fn object_to_text(value: &Object) -> Option<String> {
    match value {
        Object::String(_, _) => decode_text_string(value).ok(),
        Object::Name(bytes) => Some(String::from_utf8_lossy(bytes).to_string()),
        _ => None,
    }
}

fn object_to_value(value: &Object) -> Option<String> {
    if let Some(text) = object_to_text(value) {
        return Some(text);
    }
    let Object::Array(values) = value else {
        return None;
    };
    let joined = values
        .iter()
        .filter_map(object_to_text)
        .collect::<Vec<_>>()
        .join(", ");
    (!joined.is_empty()).then_some(joined)
}

fn choice_options(doc: &Document, value: &Object) -> Vec<String> {
    let Some(array) = resolved_object(doc, value).and_then(|value| value.as_array().ok()) else {
        return Vec::new();
    };
    array
        .iter()
        .filter_map(|entry| {
            let entry = resolved_object(doc, entry)?;
            if let Some(value) = object_to_text(entry) {
                return Some(value);
            }
            entry
                .as_array()
                .ok()
                .and_then(|pair| pair.first())
                .and_then(object_to_text)
        })
        .collect()
}

fn button_states(doc: &Document, widget_ids: &[ObjectId]) -> Vec<String> {
    let mut states = Vec::new();
    for widget_id in widget_ids {
        let Some(widget) = doc
            .get_object(*widget_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
        else {
            continue;
        };
        let Some(appearance) = widget
            .get(b"AP")
            .ok()
            .and_then(|value| resolved_object(doc, value))
            .and_then(|value| value.as_dict().ok())
        else {
            continue;
        };
        let Some(normal) = appearance
            .get(b"N")
            .ok()
            .and_then(|value| resolved_object(doc, value))
            .and_then(|value| value.as_dict().ok())
        else {
            continue;
        };
        states.extend(
            normal
                .iter()
                .filter(|(name, _)| name.as_slice() != b"Off")
                .map(|(name, _)| String::from_utf8_lossy(name).to_string()),
        );
    }
    states
}

fn widget_page_map(doc: &Document) -> HashMap<ObjectId, u32> {
    let mut pages = HashMap::new();
    for (page_number, page_id) in doc.get_pages() {
        let Some(page) = doc
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
        else {
            continue;
        };
        for widget_id in child_references(doc, page, b"Annots") {
            pages.insert(widget_id, page_number.saturating_sub(1));
        }
    }
    pages
}

fn first_widget_location(
    doc: &Document,
    widget_ids: &[ObjectId],
    page_by_widget: &HashMap<ObjectId, u32>,
    page_by_object: &HashMap<ObjectId, u32>,
) -> (Option<u32>, [f32; 4]) {
    for widget_id in widget_ids {
        let Some(widget) = doc
            .get_object(*widget_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
        else {
            continue;
        };
        let page = widget
            .get(b"P")
            .ok()
            .and_then(|value| value.as_reference().ok())
            .and_then(|page_id| page_by_object.get(&page_id).copied())
            .or_else(|| page_by_widget.get(widget_id).copied());
        let rect = widget
            .get(b"Rect")
            .ok()
            .and_then(|value| resolved_object(doc, value))
            .map(rect_from_object)
            .unwrap_or([0.0; 4]);
        return (page, rect);
    }
    (None, [0.0; 4])
}

fn rect_from_object(value: &Object) -> [f32; 4] {
    let Ok(items) = value.as_array() else {
        return [0.0; 4];
    };
    if items.len() != 4 {
        return [0.0; 4];
    }
    let mut rect = [0.0; 4];
    for (index, item) in items.iter().enumerate() {
        rect[index] = match item {
            Object::Integer(value) => *value as f32,
            Object::Real(value) => *value,
            _ => return [0.0; 4],
        };
    }
    rect
}

fn validate_update(record: &FieldRecord, update: &FormValueUpdate) -> Result<()> {
    if !matches!(
        record.field.kind,
        FormFieldKind::Checkbox | FormFieldKind::Radio | FormFieldKind::Choice
    ) {
        return Ok(());
    }
    let Some(value) = update.value.as_ref() else {
        return Ok(());
    };
    if record.field.options.is_empty() || record.field.options.contains(value) {
        return Ok(());
    }
    bail!(
        "value '{}' is not valid for form field {}",
        value,
        update.field_id
    )
}

fn write_field_value(
    doc: &mut Document,
    owner_id: ObjectId,
    kind: &FormFieldKind,
    value: &Option<String>,
) -> Result<()> {
    let field = doc
        .get_object_mut(owner_id)
        .context("resolve form field for update")?
        .as_dict_mut()
        .context("form field for update is not a dictionary")?;
    match value {
        Some(value) if matches!(kind, FormFieldKind::Checkbox | FormFieldKind::Radio) => {
            field.set("V", Object::Name(value.as_bytes().to_vec()));
        }
        Some(value) => {
            field.set("V", text_string(value));
            if matches!(kind, FormFieldKind::Choice) {
                field.remove(b"I");
            }
        }
        None => {
            field.remove(b"V");
            if matches!(kind, FormFieldKind::Choice) {
                field.remove(b"I");
            }
        }
    }
    if matches!(kind, FormFieldKind::Text) {
        field.remove(b"RV");
    }
    Ok(())
}

fn sync_button_widgets(
    doc: &mut Document,
    record: &FieldRecord,
    selected: Option<&str>,
) -> Result<()> {
    for widget_id in &record.widget_ids {
        let supported = widget_button_states(doc, *widget_id);
        let state = selected
            .filter(|value| supported.is_empty() || supported.iter().any(|state| state == value))
            .unwrap_or("Off");
        let widget = doc
            .get_object_mut(*widget_id)
            .context("resolve button widget for update")?
            .as_dict_mut()
            .context("button widget for update is not a dictionary")?;
        widget.set("AS", Object::Name(state.as_bytes().to_vec()));
    }
    Ok(())
}

fn widget_button_states(doc: &Document, widget_id: ObjectId) -> Vec<String> {
    button_states(doc, &[widget_id])
}

fn invalidate_widget_appearances(doc: &mut Document, widget_ids: &[ObjectId]) -> Result<()> {
    for widget_id in widget_ids {
        let widget = doc
            .get_object_mut(*widget_id)
            .context("resolve widget appearance for update")?
            .as_dict_mut()
            .context("widget appearance for update is not a dictionary")?;
        widget.remove(b"AP");
    }
    Ok(())
}

fn set_need_appearances(doc: &mut Document) -> Result<()> {
    let root_id = doc
        .trailer
        .get(b"Root")
        .context("PDF catalog is missing")?
        .as_reference()
        .context("PDF catalog is not indirect")?;
    let acroform_ref = doc
        .get_object(root_id)
        .context("resolve PDF catalog")?
        .as_dict()
        .context("PDF catalog is not a dictionary")?
        .get(b"AcroForm")
        .context("PDF catalog has no AcroForm")?
        .as_reference()
        .ok();

    if let Some(acroform_id) = acroform_ref {
        doc.get_object_mut(acroform_id)
            .context("resolve AcroForm for update")?
            .as_dict_mut()
            .context("AcroForm is not a dictionary")?
            .set("NeedAppearances", Object::Boolean(true));
        return Ok(());
    }

    let catalog = doc
        .get_object_mut(root_id)
        .context("resolve PDF catalog for update")?
        .as_dict_mut()
        .context("PDF catalog is not a dictionary")?;
    let acroform = catalog
        .get_mut(b"AcroForm")
        .context("PDF catalog has no AcroForm")?
        .as_dict_mut()
        .context("AcroForm is not a dictionary")?;
    acroform.set("NeedAppearances", Object::Boolean(true));
    Ok(())
}

fn format_id(id: ObjectId) -> String {
    format!("{}:{}", id.0, id.1)
}

fn validate_pdf_input(path: &Path) -> Result<()> {
    if !path.exists() {
        bail!("input PDF does not exist: {}", path.display());
    }
    if !path.is_file() {
        bail!("input PDF is not a file: {}", path.display());
    }
    if !has_pdf_extension(path) {
        bail!("input path is not a PDF: {}", path.display());
    }
    Ok(())
}

fn validate_pdf_output(input: &Path, output: &Path) -> Result<()> {
    if !has_pdf_extension(output) {
        bail!("output path is not a PDF: {}", output.display());
    }
    let parent = output.parent().unwrap_or_else(|| Path::new("."));
    if !parent.exists() || !parent.is_dir() {
        bail!("output directory does not exist: {}", parent.display());
    }
    let same_path = match (input.canonicalize(), output.canonicalize()) {
        (Ok(input), Ok(output)) => input == output,
        _ => input == output,
    };
    if same_path {
        bail!("input and output PDF must be different files");
    }
    Ok(())
}

fn has_pdf_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Stream};
    use tempfile::tempdir;

    struct FormFixture {
        text_field_id: ObjectId,
        text_widget_id: ObjectId,
        checkbox_field_id: ObjectId,
        checkbox_widget_id: ObjectId,
        acroform_id: ObjectId,
    }

    fn write_form_fixture(path: &Path) -> FormFixture {
        let mut doc = Document::with_version("1.7");
        let pages_id = doc.new_object_id();
        let page_id = doc.new_object_id();
        let text_field_id = doc.new_object_id();
        let text_widget_id = doc.new_object_id();
        let checkbox_field_id = doc.new_object_id();
        let checkbox_widget_id = doc.new_object_id();
        let acroform_id = doc.new_object_id();
        let catalog_id = doc.new_object_id();

        let old_text_appearance = doc.add_object(Stream::new(dictionary! {}, b"old".to_vec()));
        let off_appearance = doc.add_object(Stream::new(dictionary! {}, b"off".to_vec()));
        let yes_appearance = doc.add_object(Stream::new(dictionary! {}, b"yes".to_vec()));
        let checkbox_normal = doc.add_object(dictionary! {
            "Off" => Object::Reference(off_appearance),
            "Yes" => Object::Reference(yes_appearance),
        });

        doc.set_object(
            text_widget_id,
            dictionary! {
                "Type" => "Annot",
                "Subtype" => "Widget",
                "Parent" => Object::Reference(text_field_id),
                "P" => Object::Reference(page_id),
                "Rect" => vec![36.into(), 700.into(), 240.into(), 724.into()],
                "AP" => dictionary! { "N" => Object::Reference(old_text_appearance) },
            },
        );
        doc.set_object(
            text_field_id,
            dictionary! {
                "T" => text_string("person.name"),
                "FT" => "Tx",
                "V" => text_string("Filled"),
                "RV" => text_string("<b>Filled</b>"),
                "Kids" => vec![Object::Reference(text_widget_id)],
            },
        );
        doc.set_object(
            checkbox_widget_id,
            dictionary! {
                "Type" => "Annot",
                "Subtype" => "Widget",
                "Parent" => Object::Reference(checkbox_field_id),
                "P" => Object::Reference(page_id),
                "Rect" => vec![36.into(), 650.into(), 52.into(), 666.into()],
                "AP" => dictionary! { "N" => Object::Reference(checkbox_normal) },
                "AS" => "Off",
            },
        );
        doc.set_object(
            checkbox_field_id,
            dictionary! {
                "T" => text_string("accepted"),
                "FT" => "Btn",
                "V" => "Off",
                "Kids" => vec![Object::Reference(checkbox_widget_id)],
            },
        );
        doc.set_object(
            page_id,
            dictionary! {
                "Type" => "Page",
                "Parent" => Object::Reference(pages_id),
                "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
                "Resources" => dictionary! {},
                "Annots" => vec![
                    Object::Reference(text_widget_id),
                    Object::Reference(checkbox_widget_id),
                ],
            },
        );
        doc.set_object(
            pages_id,
            dictionary! {
                "Type" => "Pages",
                "Kids" => vec![Object::Reference(page_id)],
                "Count" => 1,
            },
        );
        doc.set_object(
            acroform_id,
            dictionary! {
                "Fields" => vec![
                    Object::Reference(text_field_id),
                    Object::Reference(checkbox_field_id),
                ],
            },
        );
        doc.set_object(
            catalog_id,
            dictionary! {
                "Type" => "Catalog",
                "Pages" => Object::Reference(pages_id),
                "AcroForm" => Object::Reference(acroform_id),
            },
        );
        doc.trailer.set("Root", Object::Reference(catalog_id));
        doc.compress();
        doc.save(path).expect("save form fixture");

        FormFixture {
            text_field_id,
            text_widget_id,
            checkbox_field_id,
            checkbox_widget_id,
            acroform_id,
        }
    }

    #[test]
    fn reads_inherited_field_values_and_button_states() {
        let dir = tempdir().expect("tempdir");
        let input = dir.path().join("form.pdf");
        let fixture = write_form_fixture(&input);

        let fields = read_form_fields(&input).expect("read form fields");

        assert_eq!(fields.len(), 2);
        let text = fields
            .iter()
            .find(|field| field.id == format_id(fixture.text_field_id))
            .expect("text field");
        assert_eq!(text.name, "person.name");
        assert_eq!(text.value.as_deref(), Some("Filled"));
        assert_eq!(text.kind, FormFieldKind::Text);
        assert_eq!(text.page_index, Some(0));
        assert_eq!(text.rect, [36.0, 700.0, 240.0, 724.0]);

        let checkbox = fields
            .iter()
            .find(|field| field.id == format_id(fixture.checkbox_field_id))
            .expect("checkbox field");
        assert_eq!(checkbox.value.as_deref(), Some("Off"));
        assert_eq!(checkbox.options, vec!["Yes"]);
    }

    #[test]
    fn edits_and_clears_fields_without_flattening() {
        let dir = tempdir().expect("tempdir");
        let input = dir.path().join("form.pdf");
        let output = dir.path().join("filled.pdf");
        let cleared = dir.path().join("cleared.pdf");
        let fixture = write_form_fixture(&input);

        set_form_values(
            &input,
            &output,
            &[
                FormValueUpdate {
                    field_id: format_id(fixture.text_field_id),
                    value: Some("Edited".to_string()),
                },
                FormValueUpdate {
                    field_id: format_id(fixture.checkbox_field_id),
                    value: Some("Yes".to_string()),
                },
            ],
        )
        .expect("save edited form");

        let edited = Document::load(&output).expect("load edited form");
        let text_field = edited
            .get_object(fixture.text_field_id)
            .expect("text field")
            .as_dict()
            .expect("text field dictionary");
        assert_eq!(
            text_field
                .get(b"V")
                .ok()
                .and_then(|value| decode_text_string(value).ok())
                .as_deref(),
            Some("Edited")
        );
        assert!(!text_field.has(b"RV"));
        let text_widget = edited
            .get_object(fixture.text_widget_id)
            .expect("text widget")
            .as_dict()
            .expect("text widget dictionary");
        assert!(!text_widget.has(b"AP"));

        let checkbox_widget = edited
            .get_object(fixture.checkbox_widget_id)
            .expect("checkbox widget")
            .as_dict()
            .expect("checkbox widget dictionary");
        assert!(checkbox_widget.has(b"AP"));
        assert_eq!(
            checkbox_widget
                .get(b"AS")
                .expect("appearance state")
                .as_name_str()
                .expect("appearance state name"),
            "Yes"
        );
        let acroform = edited
            .get_object(fixture.acroform_id)
            .expect("AcroForm")
            .as_dict()
            .expect("AcroForm dictionary");
        assert_eq!(
            acroform.get(b"NeedAppearances").expect("NeedAppearances"),
            &Object::Boolean(true)
        );

        set_form_values(
            &output,
            &cleared,
            &[FormValueUpdate {
                field_id: format_id(fixture.text_field_id),
                value: None,
            }],
        )
        .expect("clear text field");

        let fields = read_form_fields(&cleared).expect("read cleared form");
        let text = fields
            .iter()
            .find(|field| field.id == format_id(fixture.text_field_id))
            .expect("cleared text field");
        assert_eq!(text.value, None);
        assert_eq!(fields.len(), 2);
    }
}
