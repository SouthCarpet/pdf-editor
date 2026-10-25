// Phase 12 Task 67 — Edit Tier 2 (annotations), Delta U full configurability.
//
// Each `Annotation` variant carries the full set of PDF spec keys that the
// matching `/Annot` dictionary needs: outline + fill color, stroke width,
// dash pattern, line endings, opacity, font / size / alignment for free
// text, etc.
//
// FreeText embeds its font via the REAL Type0 CIDFont path when the user
// picks a non-Standard-14 family. There is no silent fallback to
// Helvetica. If the chosen postscript_name cannot be located on disk, the
// command returns AppError::Internal with a clear message — the frontend
// surfaces it.
//
// Image-based stamps embed the raw image bytes as a `/Subtype /Image`
// XObject and render through the annotation's `/AP /N` appearance stream.
use anyhow::{Context, Result};
use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tracing::warn;

use crate::services::font_embed::FontSubsetter;
use crate::services::fonts::{
    find_by_postscript_name, is_standard_14, list_system_fonts, SystemFont,
};
use crate::services::own_fields::{self, FieldNames, OwnField, OwnFieldKind};
use crate::services::text_style::{textBlockOffset, TextAlign, TextStyle};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Annotation {
    Highlight {
        page: u32,
        quads: Vec<[f32; 8]>,
        color: [f32; 3],
        opacity: f32,
    },
    Note {
        page: u32,
        x: f32,
        y: f32,
        contents: String,
        icon: NoteIcon,
        color: [f32; 3],
    },
    Square {
        page: u32,
        rect: [f32; 4],
        border_color: [f32; 3],
        border_width: f32,
        border_style: BorderStyle,
        /// `None` = transparent fill. Alpha is in `[3]`.
        fill_color: Option<[f32; 4]>,
        corner_radius: f32,
    },
    Circle {
        page: u32,
        rect: [f32; 4],
        border_color: [f32; 3],
        border_width: f32,
        border_style: BorderStyle,
        fill_color: Option<[f32; 4]>,
    },
    Line {
        page: u32,
        from: [f32; 2],
        to: [f32; 2],
        color: [f32; 3],
        width: f32,
        style: BorderStyle,
        arrow_start: LineEnd,
        arrow_end: LineEnd,
    },
    FreeText {
        page: u32,
        rect: [f32; 4],
        contents: String,
        /// Delta U: full TextStyle replaces the old enum-based font.
        /// Non-Standard-14 fonts are embedded via Type0 CIDFont.
        style: TextStyle,
        background_fill: Option<[f32; 4]>,
        border_color: [f32; 3],
        border_width: f32,
        auto_resize: bool,
    },
    Stamp {
        page: u32,
        rect: [f32; 4],
        image_path: String,
        scale: f32,
        rotation: f32,
        opacity: f32,
    },
    Ink {
        page: u32,
        lines: Vec<Vec<[f32; 2]>>,
        color: [f32; 3],
        width: f32,
        opacity: f32,
        smoothing: bool,
    },
    /// Plan 119 O1: a form field the user draws. `own_fields` writes it as
    /// a real AcroForm field; it has no value when saved.
    FormField {
        page: u32,
        /// PDF points, `[x1, y1, x2, y2]`, unrotated page user space.
        rect: [f32; 4],
        /// Requested partial name; the writer sanitizes it and makes it unique.
        name: String,
        kind: OwnFieldKind,
        /// Text only.
        multiline: bool,
        /// Points; `0.0` means auto.
        font_size: f32,
        /// Saved own field whose value and settings this layout edit keeps.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[specta(optional)]
        source_field: Option<AnnotationRef>,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum NoteIcon {
    Comment,
    Check,
    Cross,
    Key,
    Note,
    Insert,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum BorderStyle {
    Solid,
    Dashed,
    Dotted,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum LineEnd {
    None,
    OpenArrow,
    ClosedArrow,
    Diamond,
    Square,
    Circle,
}

/// Plan 119 p1b: an annotation object already in a saved file, by its PDF
/// object number and generation. pdf.js shows the same object as `"12R"`
/// (`"12R3"` for generation 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
pub struct AnnotationRef {
    pub object: u32,
    pub generation: u16,
}

impl From<ObjectId> for AnnotationRef {
    fn from((object, generation): ObjectId) -> Self {
        Self { object, generation }
    }
}

pub fn apply_annotations(input: &Path, output: &Path, annotations: &[Annotation]) -> Result<()> {
    save_annotations(input, output, annotations, &[]).map(|_| ())
}

/// Writes `annotations` into a copy of `input` and first removes the saved
/// annotations in `replaced`, so an edited saved value replaces the old one
/// instead of lying on top of it. Returns the object of each written
/// annotation in input order (`None` for a page the file does not have and
/// for an empty fill, which is not written).
pub fn save_annotations(
    input: &Path,
    output: &Path,
    annotations: &[Annotation],
    replaced: &[AnnotationRef],
) -> Result<Vec<Option<AnnotationRef>>> {
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
    validate_removals(&doc, replaced)?;
    let mut saved_fields = saved_own_fields(&doc, annotations, replaced)?;
    remove_annotations(&mut doc, replaced);
    // After the removal, so a replaced own field can keep its name.
    let mut names = FieldNames::of(&doc);
    let pages = doc.get_pages();
    let mut written = Vec::with_capacity(annotations.len());
    for ann in annotations {
        let target = pages.get(&(annotation_page(ann) + 1));
        let Some(&page_id) = target.filter(|_| !is_empty_fill(ann)) else {
            written.push(None);
            continue;
        };
        let annot_id = write_annotation(&mut doc, page_id, ann, &mut names, &mut saved_fields)?;
        written.push(Some(AnnotationRef::from(annot_id)));
        with_page_annots(&mut doc, page_id, |annots| {
            annots.push(Object::Reference(annot_id));
        });
    }
    doc.compress();
    replace_file_atomically(output, |file| {
        let mut writer = std::io::BufWriter::new(file);
        doc.save_to(&mut writer)?;
        std::io::Write::flush(&mut writer)?;
        Ok(())
    })?;
    Ok(written)
}

/// Adds the object of one annotation and returns its id. An own field goes
/// to `own_fields` (plan 119 O1), because it also changes the catalog.
fn write_annotation(
    doc: &mut Document,
    page_id: ObjectId,
    ann: &Annotation,
    names: &mut FieldNames,
    saved_fields: &mut HashMap<AnnotationRef, SavedOwnField>,
) -> Result<ObjectId> {
    if let Annotation::FormField {
        rect,
        name,
        kind,
        multiline,
        font_size,
        source_field,
        ..
    } = ann
    {
        let field = OwnField {
            rect: *rect,
            name,
            kind: *kind,
            multiline: *multiline,
            font_size: *font_size,
        };
        let saved = source_field
            .as_ref()
            .and_then(|source| saved_fields.remove(source))
            .map(|saved| {
                for (id, appearance) in saved.appearances {
                    doc.set_object(id, appearance);
                }
                saved.widget
            });
        return own_fields::write_own_field(doc, page_id, &field, names, saved);
    }
    let (dict, font_binding) = build_annot_dict(ann, doc)?;
    let annot_id = doc.add_object(Object::Dictionary(dict));
    // Bind any embedded font to the page's /Resources /Font.
    if let Some((alias, font_id)) = font_binding {
        ensure_page_font(doc, page_id, &alias, font_id)?;
    }
    Ok(annot_id)
}

/// Runs `edit` on the page's `/Annots` array. A direct array is edited in the
/// page. An indirect reference keeps pointing at its array object, which is
/// edited in place. A missing or unusable `/Annots` starts an empty direct
/// array. Plan 119 O0: the add path once replaced an indirect list with a
/// one-item list, and the remove path skipped it.
fn with_page_annots(doc: &mut Document, page_id: ObjectId, edit: impl FnOnce(&mut Vec<Object>)) {
    let indirect = doc
        .get_dictionary(page_id)
        .ok()
        .and_then(|page| page.get(b"Annots").ok())
        .and_then(|entry| entry.as_reference().ok());
    if let Some(Object::Array(annots)) = indirect.and_then(|id| doc.objects.get_mut(&id)) {
        edit(annots);
        return;
    }
    let Ok(page) = doc.get_object_mut(page_id).and_then(Object::as_dict_mut) else {
        return;
    };
    let mut annots = match page.get_mut(b"Annots") {
        Ok(Object::Array(annots)) => std::mem::take(annots),
        _ => Vec::new(),
    };
    edit(&mut annots);
    if !annots.is_empty() {
        page.set("Annots", annots);
    }
}

/// Plan 119 p1c: a FreeText with no text, no border and no background draws
/// nothing. It is how the editor says "this cell has no value": as a
/// replacement it deletes the saved value (the old object is removed above
/// and nothing takes its place), as a new fill it is ignored.
fn is_empty_fill(ann: &Annotation) -> bool {
    matches!(
        ann,
        Annotation::FreeText { contents, background_fill: None, border_width, .. }
            if contents.trim().is_empty() && *border_width <= 0.0
    )
}

fn validate_removals(doc: &Document, replaced: &[AnnotationRef]) -> Result<()> {
    if replaced.is_empty() {
        return Ok(());
    }
    let field_ids = own_fields::field_tree_ids(doc);
    for reference in replaced {
        let id = (reference.object, reference.generation);
        let Ok(field) = doc.get_dictionary(id) else {
            continue;
        };
        let is_field = field_ids.contains(&id)
            || field.has(b"FT")
            || field
                .get(b"Subtype")
                .and_then(Object::as_name)
                .is_ok_and(|kind| kind == b"Widget");
        if is_field && !own_fields::is_own_field(field) {
            anyhow::bail!("cannot remove a source form field");
        }
    }
    Ok(())
}

struct SavedOwnField {
    widget: lopdf::Dictionary,
    appearances: Vec<(ObjectId, Object)>,
}

fn saved_own_fields(
    doc: &Document,
    annotations: &[Annotation],
    replaced: &[AnnotationRef],
) -> Result<HashMap<AnnotationRef, SavedOwnField>> {
    let removals: HashSet<_> = replaced.iter().copied().collect();
    let mut saved = HashMap::new();
    for annotation in annotations {
        let Annotation::FormField {
            source_field: Some(source),
            ..
        } = annotation
        else {
            continue;
        };
        if !removals.contains(source) {
            anyhow::bail!("saved own field source must be replaced");
        }
        if saved.contains_key(source) {
            anyhow::bail!("duplicate saved own field source");
        }
        saved.insert(*source, saved_own_field(doc, source)?);
    }
    Ok(saved)
}

fn saved_own_field(doc: &Document, reference: &AnnotationRef) -> Result<SavedOwnField> {
    let widget = doc
        .get_dictionary((reference.object, reference.generation))
        .context("saved own field source not found")?;
    if !own_fields::is_own_field(widget) {
        anyhow::bail!("cannot remove a source form field");
    }
    let appearances = normal_appearance_ids(widget)
        .into_iter()
        .filter_map(|id| {
            doc.get_object(id)
                .ok()
                .map(|appearance| (id, appearance.clone()))
        })
        .collect();
    Ok(SavedOwnField {
        widget: widget.clone(),
        appearances,
    })
}

/// Drops each referenced annotation from every page's `/Annots` and from
/// the top level of `/AcroForm /Fields` (plan 119 O1 rule 9), then deletes
/// its object and its normal appearance streams.
fn remove_annotations(doc: &mut Document, replaced: &[AnnotationRef]) {
    if replaced.is_empty() {
        return;
    }
    let ids: HashSet<ObjectId> = replaced
        .iter()
        .map(|reference| (reference.object, reference.generation))
        .collect();
    for page_id in doc.get_pages().into_values() {
        with_page_annots(doc, page_id, |annots| {
            annots.retain(|annot| !matches!(annot, Object::Reference(id) if ids.contains(id)));
        });
    }
    own_fields::remove_from_fields(doc, &ids);
    for id in ids {
        if let Some(Object::Dictionary(annot)) = doc.objects.remove(&id) {
            for appearance in normal_appearance_ids(&annot) {
                doc.objects.remove(&appearance);
            }
        }
    }
}

/// The normal appearance stream, or one stream per state (a checkbox has
/// `/Off` and `/Yes`).
fn normal_appearance_ids(annot: &lopdf::Dictionary) -> Vec<ObjectId> {
    let normal = annot
        .get(b"AP")
        .and_then(Object::as_dict)
        .and_then(|appearance| appearance.get(b"N"));
    match normal {
        Ok(Object::Reference(id)) => vec![*id],
        Ok(Object::Dictionary(states)) => states
            .iter()
            .filter_map(|(_, state)| state.as_reference().ok())
            .collect(),
        _ => Vec::new(),
    }
}

/// Plan 119 p1: a save may write over the copy it started from (the second
/// save of a session). Write to a temporary file in the same folder, sync
/// it, and only then replace the target, so a failed write leaves the
/// earlier saved copy intact. `persist` replaces an existing target on
/// Windows too (`MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`).
pub(crate) fn replace_file_atomically(
    output: &Path,
    write: impl FnOnce(&mut std::fs::File) -> Result<()>,
) -> Result<()> {
    let folder = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut staged = tempfile::NamedTempFile::new_in(folder)
        .with_context(|| format!("create a temporary file next to {}", output.display()))?;
    write(staged.as_file_mut())?;
    staged.as_file().sync_all()?;
    staged
        .persist(output)
        .map_err(|error| error.error)
        .with_context(|| format!("replace {}", output.display()))?;
    Ok(())
}

fn annotation_page(ann: &Annotation) -> u32 {
    match ann {
        Annotation::Highlight { page, .. }
        | Annotation::Note { page, .. }
        | Annotation::Square { page, .. }
        | Annotation::Circle { page, .. }
        | Annotation::Line { page, .. }
        | Annotation::FreeText { page, .. }
        | Annotation::Stamp { page, .. }
        | Annotation::Ink { page, .. }
        | Annotation::FormField { page, .. } => *page,
    }
}

fn color_array(color: &[f32; 3]) -> Object {
    Object::Array(color.iter().map(|c| Object::Real(*c)).collect())
}

fn rect_array(rect: &[f32; 4]) -> Object {
    Object::Array(rect.iter().map(|f| Object::Real(*f)).collect())
}

fn opacity_keys(d: &mut lopdf::Dictionary, opacity: f32) {
    let o = opacity.clamp(0.0, 1.0);
    d.set("CA", Object::Real(o));
    d.set("ca", Object::Real(o));
}

fn build_bs(width: f32, style: BorderStyle) -> Object {
    let mut bs = dictionary! { "Type" => "Border", "W" => width };
    match style {
        BorderStyle::Solid => {
            bs.set("S", Object::Name(b"S".to_vec()));
        }
        BorderStyle::Dashed => {
            bs.set("S", Object::Name(b"D".to_vec()));
            bs.set(
                "D",
                Object::Array(vec![Object::Real(3.0), Object::Real(3.0)]),
            );
        }
        BorderStyle::Dotted => {
            bs.set("S", Object::Name(b"D".to_vec()));
            bs.set(
                "D",
                Object::Array(vec![Object::Real(1.0), Object::Real(2.0)]),
            );
        }
    }
    Object::Dictionary(bs)
}

fn note_icon_name(icon: NoteIcon) -> &'static [u8] {
    match icon {
        NoteIcon::Comment => b"Comment",
        NoteIcon::Check => b"Check",
        NoteIcon::Cross => b"Cross",
        NoteIcon::Key => b"Key",
        NoteIcon::Note => b"Note",
        NoteIcon::Insert => b"Insert",
    }
}

fn line_end_name(end: LineEnd) -> &'static [u8] {
    match end {
        LineEnd::None => b"None",
        LineEnd::OpenArrow => b"OpenArrow",
        LineEnd::ClosedArrow => b"ClosedArrow",
        LineEnd::Diamond => b"Diamond",
        LineEnd::Square => b"Square",
        LineEnd::Circle => b"Circle",
    }
}

fn align_value(align: TextAlign) -> i64 {
    // PDF Q value: 0 = left, 1 = centered, 2 = right. Justify is a viewer
    // hint we honor at render-time; the spec only defines 0/1/2 so we
    // round-trip justify as left for max-compatible storage.
    match align {
        TextAlign::Left | TextAlign::Justify => 0,
        TextAlign::Center => 1,
        TextAlign::Right => 2,
    }
}

/// Returns (annotation_dict, optional_font_binding). The font binding,
/// when present, is (resource_alias, font_object_id) — the caller wires
/// it into the page's /Resources /Font dictionary.
fn build_annot_dict(
    ann: &Annotation,
    doc: &mut Document,
) -> Result<(lopdf::Dictionary, Option<(String, ObjectId)>)> {
    match ann {
        Annotation::Highlight {
            quads,
            color,
            opacity,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "Highlight" };
            d.set("C", color_array(color));
            opacity_keys(&mut d, *opacity);
            let qp: Vec<Object> = quads
                .iter()
                .flat_map(|q| q.iter().map(|f| Object::Real(*f)))
                .collect();
            d.set("QuadPoints", Object::Array(qp));
            let rect: Vec<Object> = if let Some(q) = quads.first() {
                vec![
                    Object::Real(q[0].min(q[2]).min(q[4]).min(q[6])),
                    Object::Real(q[1].min(q[3]).min(q[5]).min(q[7])),
                    Object::Real(q[0].max(q[2]).max(q[4]).max(q[6])),
                    Object::Real(q[1].max(q[3]).max(q[5]).max(q[7])),
                ]
            } else {
                vec![Object::Real(0.0); 4]
            };
            d.set("Rect", Object::Array(rect));
            Ok((d, None))
        }
        Annotation::Note {
            x,
            y,
            contents,
            icon,
            color,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "Text" };
            d.set("Contents", pdf_text_string(contents));
            d.set("Name", Object::Name(note_icon_name(*icon).to_vec()));
            d.set("C", color_array(color));
            d.set(
                "Rect",
                Object::Array(vec![
                    Object::Real(*x),
                    Object::Real(*y),
                    Object::Real(*x + 20.0),
                    Object::Real(*y + 20.0),
                ]),
            );
            Ok((d, None))
        }
        Annotation::Square {
            rect,
            border_color,
            border_width,
            border_style,
            fill_color,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "Square" };
            d.set("Rect", rect_array(rect));
            d.set("C", color_array(border_color));
            d.set("BS", build_bs(*border_width, *border_style));
            if let Some(fc) = fill_color {
                d.set(
                    "IC",
                    Object::Array(vec![
                        Object::Real(fc[0]),
                        Object::Real(fc[1]),
                        Object::Real(fc[2]),
                    ]),
                );
                opacity_keys(&mut d, fc[3]);
            }
            Ok((d, None))
        }
        Annotation::Circle {
            rect,
            border_color,
            border_width,
            border_style,
            fill_color,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "Circle" };
            d.set("Rect", rect_array(rect));
            d.set("C", color_array(border_color));
            d.set("BS", build_bs(*border_width, *border_style));
            if let Some(fc) = fill_color {
                d.set(
                    "IC",
                    Object::Array(vec![
                        Object::Real(fc[0]),
                        Object::Real(fc[1]),
                        Object::Real(fc[2]),
                    ]),
                );
                opacity_keys(&mut d, fc[3]);
            }
            Ok((d, None))
        }
        Annotation::Line {
            from,
            to,
            color,
            width,
            style,
            arrow_start,
            arrow_end,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "Line" };
            d.set(
                "L",
                Object::Array(vec![
                    Object::Real(from[0]),
                    Object::Real(from[1]),
                    Object::Real(to[0]),
                    Object::Real(to[1]),
                ]),
            );
            d.set(
                "Rect",
                Object::Array(vec![
                    Object::Real(from[0].min(to[0])),
                    Object::Real(from[1].min(to[1])),
                    Object::Real(from[0].max(to[0])),
                    Object::Real(from[1].max(to[1])),
                ]),
            );
            d.set("C", color_array(color));
            d.set("BS", build_bs(*width, *style));
            d.set(
                "LE",
                Object::Array(vec![
                    Object::Name(line_end_name(*arrow_start).to_vec()),
                    Object::Name(line_end_name(*arrow_end).to_vec()),
                ]),
            );
            Ok((d, None))
        }
        Annotation::FreeText {
            rect,
            contents,
            style,
            background_fill,
            border_color,
            border_width,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "FreeText" };
            d.set("Rect", rect_array(rect));
            d.set("Contents", pdf_text_string(contents));
            d.set("Q", Object::Integer(align_value(style.align)));
            d.set("C", color_array(border_color));
            d.set("BS", build_bs(*border_width, BorderStyle::Solid));
            if let Some(fc) = background_fill {
                d.set(
                    "IC",
                    Object::Array(vec![
                        Object::Real(fc[0]),
                        Object::Real(fc[1]),
                        Object::Real(fc[2]),
                    ]),
                );
                opacity_keys(&mut d, fc[3]);
            }

            let resolved_font = resolve_free_text_font(doc, contents, style)?;
            let alias = resolved_font.alias;
            let font_id = resolved_font.font_id;

            // /DA "default appearance" — names the font, size, and color.
            let da = format!(
                "/{} {} Tf {} {} {} rg",
                alias, style.size_pt, style.color[0], style.color[1], style.color[2],
            );
            d.set("DA", Object::string_literal(da));

            // Provide a /DR with the font dict so viewers don't need to
            // rely solely on the page's /Resources for rendering the
            // appearance.
            let mut font_dict = lopdf::Dictionary::new();
            font_dict.set(alias.as_bytes().to_vec(), Object::Reference(font_id));
            let mut dr = lopdf::Dictionary::new();
            dr.set("Font", Object::Dictionary(font_dict));
            d.set("DR", Object::Dictionary(dr));

            // An explicit appearance makes the saved PDF use the same
            // horizontal and vertical placement as the pending preview.
            // /Q remains present for viewers that regenerate the appearance.
            let ap_stream = build_free_text_ap_stream(FreeTextAppearance {
                alias: &alias,
                font_id,
                rect,
                contents,
                lines: &resolved_font.lines,
                style,
                background_fill: *background_fill,
                border_color: *border_color,
                border_width: *border_width,
            })?;
            let ap_id = doc.add_object(Object::Stream(ap_stream));
            let mut ap = lopdf::Dictionary::new();
            ap.set("N", Object::Reference(ap_id));
            d.set("AP", Object::Dictionary(ap));

            Ok((d, Some((alias, font_id))))
        }
        Annotation::Stamp {
            rect,
            image_path,
            scale,
            rotation,
            opacity,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "Stamp" };
            d.set("Rect", rect_array(rect));
            opacity_keys(&mut d, *opacity);
            if (*rotation).abs() > f32::EPSILON {
                d.set("Rotate", Object::Real(*rotation));
            }
            d.set("Name", Object::Name(b"Approved".to_vec()));
            let image_id = embed_stamp_image(doc, image_path)?;
            let ap_stream = build_image_ap_stream(image_id, rect, *scale, *rotation);
            let ap_id = doc.add_object(Object::Stream(ap_stream));
            let mut ap = lopdf::Dictionary::new();
            ap.set("N", Object::Reference(ap_id));
            d.set("AP", Object::Dictionary(ap));
            Ok((d, None))
        }
        Annotation::Ink {
            lines,
            color,
            width,
            opacity,
            ..
        } => {
            let mut d = dictionary! { "Type" => "Annot", "Subtype" => "Ink" };
            let inklist: Vec<Object> = lines
                .iter()
                .map(|line| {
                    Object::Array(
                        line.iter()
                            .flat_map(|p| vec![Object::Real(p[0]), Object::Real(p[1])])
                            .collect(),
                    )
                })
                .collect();
            d.set("InkList", Object::Array(inklist));
            d.set("C", color_array(color));
            d.set("BS", build_bs(*width, BorderStyle::Solid));
            opacity_keys(&mut d, *opacity);
            let (mut min_x, mut min_y, mut max_x, mut max_y) = (
                f32::INFINITY,
                f32::INFINITY,
                f32::NEG_INFINITY,
                f32::NEG_INFINITY,
            );
            for line in lines {
                for p in line {
                    min_x = min_x.min(p[0]);
                    min_y = min_y.min(p[1]);
                    max_x = max_x.max(p[0]);
                    max_y = max_y.max(p[1]);
                }
            }
            if !min_x.is_finite() {
                min_x = 0.0;
                min_y = 0.0;
                max_x = 0.0;
                max_y = 0.0;
            }
            d.set(
                "Rect",
                Object::Array(vec![
                    Object::Real(min_x),
                    Object::Real(min_y),
                    Object::Real(max_x),
                    Object::Real(max_y),
                ]),
            );
            Ok((d, None))
        }
        Annotation::FormField { .. } => anyhow::bail!("an own field is written by own_fields"),
    }
}

/// Mnemonic alias for Standard 14 fonts used inside /DA strings.
fn font_alias_for_ps(ps: &str) -> String {
    match ps {
        "Helvetica" => "Helv".into(),
        "Helvetica-Bold" => "HelvB".into(),
        "Helvetica-Oblique" => "HelvO".into(),
        "Helvetica-BoldOblique" => "HelvBO".into(),
        "Times-Roman" => "TiR".into(),
        "Times-Bold" => "TiB".into(),
        "Times-Italic" => "TiI".into(),
        "Times-BoldItalic" => "TiBI".into(),
        "Courier" => "Cou".into(),
        "Courier-Bold" => "CouB".into(),
        "Courier-Oblique" => "CouO".into(),
        "Courier-BoldOblique" => "CouBO".into(),
        "Symbol" => "Sym".into(),
        "ZapfDingbats" => "Zapf".into(),
        _ => "F1".into(),
    }
}

fn win_ansi_byte(character: char) -> Option<u8> {
    match character {
        ' '..='~' => Some(character as u8),
        '\u{00a0}'..='\u{00ff}' => Some(character as u8),
        '€' => Some(0x80),
        '‚' => Some(0x82),
        'ƒ' => Some(0x83),
        '„' => Some(0x84),
        '…' => Some(0x85),
        '†' => Some(0x86),
        '‡' => Some(0x87),
        'ˆ' => Some(0x88),
        '‰' => Some(0x89),
        'Š' => Some(0x8a),
        '‹' => Some(0x8b),
        'Œ' => Some(0x8c),
        'Ž' => Some(0x8e),
        '‘' => Some(0x91),
        '’' => Some(0x92),
        '“' => Some(0x93),
        '”' => Some(0x94),
        '•' => Some(0x95),
        '–' => Some(0x96),
        '—' => Some(0x97),
        '˜' => Some(0x98),
        '™' => Some(0x99),
        'š' => Some(0x9a),
        '›' => Some(0x9b),
        'œ' => Some(0x9c),
        'ž' => Some(0x9e),
        'Ÿ' => Some(0x9f),
        _ => None,
    }
}

fn encode_win_ansi(text: &str) -> std::result::Result<Vec<u8>, char> {
    text.chars()
        .map(|character| win_ansi_byte(character).ok_or(character))
        .collect()
}

fn first_unencodable_free_text_character(contents: &str) -> Option<char> {
    free_text_lines(contents)
        .into_iter()
        .find_map(|line| encode_win_ansi(line).err())
}

fn pdf_doc_encoding_byte(character: char) -> Option<u8> {
    match character {
        '\u{02d8}' => Some(0x18),
        '\u{02c7}' => Some(0x19),
        '\u{02c6}' => Some(0x1a),
        '\u{02d9}' => Some(0x1b),
        '\u{02dd}' => Some(0x1c),
        '\u{02db}' => Some(0x1d),
        '\u{02da}' => Some(0x1e),
        '\u{02dc}' => Some(0x1f),
        ' '..='~' => Some(character as u8),
        '•' => Some(0x80),
        '†' => Some(0x81),
        '‡' => Some(0x82),
        '…' => Some(0x83),
        '—' => Some(0x84),
        '–' => Some(0x85),
        'ƒ' => Some(0x86),
        '⁄' => Some(0x87),
        '‹' => Some(0x88),
        '›' => Some(0x89),
        '−' => Some(0x8a),
        '‰' => Some(0x8b),
        '„' => Some(0x8c),
        '“' => Some(0x8d),
        '”' => Some(0x8e),
        '‘' => Some(0x8f),
        '’' => Some(0x90),
        '‚' => Some(0x91),
        '™' => Some(0x92),
        'ﬁ' => Some(0x93),
        'ﬂ' => Some(0x94),
        'Ł' => Some(0x95),
        'Œ' => Some(0x96),
        'Š' => Some(0x97),
        'Ÿ' => Some(0x98),
        'Ž' => Some(0x99),
        'ı' => Some(0x9a),
        'ł' => Some(0x9b),
        'œ' => Some(0x9c),
        'š' => Some(0x9d),
        'ž' => Some(0x9e),
        '€' => Some(0xa0),
        '\u{00a1}'..='\u{00ac}' => Some(character as u8),
        '\u{00ae}'..='\u{00ff}' => Some(character as u8),
        _ => None,
    }
}

fn pdf_text_string(text: &str) -> Object {
    let pdf_doc_bytes: Option<Vec<u8>> = text.chars().map(pdf_doc_encoding_byte).collect();
    if let Some(bytes) = pdf_doc_bytes {
        return Object::String(bytes, StringFormat::Literal);
    }

    let mut bytes = Vec::with_capacity(2 + text.len() * 2);
    lopdf::encode_utf16_be(text, &mut bytes);
    Object::String(bytes, StringFormat::Hexadecimal)
}

struct AppearanceLine {
    bytes: Vec<u8>,
    width_em: f32,
    character_count: usize,
}

struct ResolvedFreeTextFont {
    alias: String,
    font_id: ObjectId,
    lines: Vec<AppearanceLine>,
}

enum Standard14TextPlan<'a> {
    Type1 {
        appearance_text: Cow<'a, str>,
        replaced_character: Option<char>,
    },
    Embedded(SystemFont),
}

fn standard_14_fallback_face(postscript_name: &str) -> Option<(&'static str, &'static str)> {
    match postscript_name {
        "Helvetica" => Some(("Arial", "Regular")),
        "Helvetica-Bold" => Some(("Arial", "Bold")),
        "Helvetica-Oblique" => Some(("Arial", "Italic")),
        "Helvetica-BoldOblique" => Some(("Arial", "BoldItalic")),
        "Times-Roman" => Some(("Times New Roman", "Regular")),
        "Times-Bold" => Some(("Times New Roman", "Bold")),
        "Times-Italic" => Some(("Times New Roman", "Italic")),
        "Times-BoldItalic" => Some(("Times New Roman", "BoldItalic")),
        "Courier" => Some(("Courier New", "Regular")),
        "Courier-Bold" => Some(("Courier New", "Bold")),
        "Courier-Oblique" => Some(("Courier New", "Italic")),
        "Courier-BoldOblique" => Some(("Courier New", "BoldItalic")),
        _ => None,
    }
}

fn find_standard_14_fallback(
    postscript_name: &str,
    fonts: impl IntoIterator<Item = SystemFont>,
) -> Option<SystemFont> {
    let (family, style) = standard_14_fallback_face(postscript_name)?;
    let target_weight = if style.starts_with("Bold") { 700 } else { 400 };
    fonts
        .into_iter()
        .filter(|font| {
            !font.is_standard_14
                && !font.file_path.is_empty()
                && font.family.eq_ignore_ascii_case(family)
                && font.style == style
        })
        .min_by_key(|font| font.weight.abs_diff(target_weight))
}

fn standard_14_text_plan<'a>(
    postscript_name: &str,
    contents: &'a str,
    fonts: impl IntoIterator<Item = SystemFont>,
) -> Standard14TextPlan<'a> {
    let Some(first_unencodable) = first_unencodable_free_text_character(contents) else {
        return Standard14TextPlan::Type1 {
            appearance_text: Cow::Borrowed(contents),
            replaced_character: None,
        };
    };

    if let Some(font) = find_standard_14_fallback(postscript_name, fonts) {
        return Standard14TextPlan::Embedded(font);
    }

    let replacement = contents
        .chars()
        .map(|character| {
            if matches!(character, '\r' | '\n') || win_ansi_byte(character).is_some() {
                character
            } else {
                '?'
            }
        })
        .collect();
    Standard14TextPlan::Type1 {
        appearance_text: Cow::Owned(replacement),
        replaced_character: Some(first_unencodable),
    }
}

fn standard_14_font(doc: &mut Document, postscript_name: &str) -> (String, ObjectId) {
    let alias = font_alias_for_ps(postscript_name);
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => Object::Name(postscript_name.as_bytes().to_vec()),
        "Encoding" => "WinAnsiEncoding",
    });
    (alias, font_id)
}

fn standard_appearance_lines(contents: &str, family: &str) -> Vec<AppearanceLine> {
    free_text_lines(contents)
        .into_iter()
        .map(|line| AppearanceLine {
            bytes: encode_win_ansi(line).expect("caller guarantees WinAnsi text"),
            width_em: line
                .chars()
                .map(|character| standard_font_character_width(family, character))
                .sum(),
            character_count: line.chars().count(),
        })
        .collect()
}

fn embedded_font(
    doc: &mut Document,
    font: &SystemFont,
    contents: &str,
) -> Result<ResolvedFreeTextFont> {
    if font.file_path.is_empty() {
        anyhow::bail!(
            "font {} has no file path; cannot embed",
            font.postscript_name
        );
    }
    let mut subsetter = FontSubsetter::new_from_path(std::path::Path::new(&font.file_path))?;
    subsetter.add_text(contents);
    let lines = free_text_lines(contents)
        .into_iter()
        .map(|line| AppearanceLine {
            bytes: subsetter.encode_text_as_cids(line),
            width_em: subsetter.text_width_em(line),
            character_count: line.chars().count(),
        })
        .collect();
    let (font_id, tag) = subsetter.write_to_pdf(doc)?;
    Ok(ResolvedFreeTextFont {
        alias: format!("F{}", &tag[..3]),
        font_id,
        lines,
    })
}

fn resolve_free_text_font(
    doc: &mut Document,
    contents: &str,
    style: &TextStyle,
) -> Result<ResolvedFreeTextFont> {
    if !is_standard_14(&style.font_postscript_name) {
        let font = find_by_postscript_name(&style.font_postscript_name).with_context(|| {
            format!(
                "font not installed on this system: {}",
                style.font_postscript_name
            )
        })?;
        return embedded_font(doc, &font, contents);
    }

    match standard_14_text_plan(&style.font_postscript_name, contents, list_system_fonts()) {
        Standard14TextPlan::Embedded(font) => embedded_font(doc, &font, contents),
        Standard14TextPlan::Type1 {
            appearance_text,
            replaced_character,
        } => {
            if let Some(character) = replaced_character {
                warn!(
                    standard_font = %style.font_postscript_name,
                    unsupported_character = %character,
                    "metric-compatible system font is unavailable; replacing non-WinAnsi characters in the FreeText appearance"
                );
            }
            let (alias, font_id) = standard_14_font(doc, &style.font_postscript_name);
            Ok(ResolvedFreeTextFont {
                alias,
                font_id,
                lines: standard_appearance_lines(&appearance_text, &style.font_family),
            })
        }
    }
}

/// Insert (alias -> font_id) into page.Resources.Font, creating
/// intermediate dictionaries as needed.
fn ensure_page_font(
    doc: &mut Document,
    page_id: ObjectId,
    alias: &str,
    font_id: ObjectId,
) -> Result<()> {
    let mut resources = page_resources_copy(doc, page_id)?;
    let mut fonts = resources
        .get(b"Font")
        .ok()
        .map(|entry| dictionary_copy(doc, entry))
        .transpose()?
        .unwrap_or_default();
    fonts.set(alias.as_bytes().to_vec(), Object::Reference(font_id));
    resources.set("Font", fonts);
    doc.get_dictionary_mut(page_id)?.set("Resources", resources);
    Ok(())
}

pub(crate) fn dictionary_copy(doc: &Document, entry: &Object) -> Result<lopdf::Dictionary> {
    Ok(doc.dereference(entry)?.1.as_dict()?.clone())
}

/// Resources may be shared or inherited. Copy them onto this page before
/// binding a value font, so another page keeps its original resources.
pub(crate) fn page_resources_copy(doc: &Document, page_id: ObjectId) -> Result<lopdf::Dictionary> {
    let mut current = page_id;
    let mut visited = HashSet::new();
    while visited.insert(current) {
        let page = doc.get_dictionary(current)?;
        if let Ok(resources) = page.get(b"Resources") {
            return dictionary_copy(doc, resources);
        }
        let Ok(parent) = page.get(b"Parent").and_then(Object::as_reference) else {
            return Ok(lopdf::Dictionary::new());
        };
        current = parent;
    }
    anyhow::bail!("cycle in page resource inheritance")
}

const FREE_TEXT_HORIZONTAL_INSET_PT: f32 = 2.0;
const DECORATION_THICKNESS_EM: f32 = 0.06;
const UNDERLINE_OFFSET_EM: f32 = -0.12;
const STRIKETHROUGH_OFFSET_EM: f32 = 0.30;

fn free_text_lines(contents: &str) -> Vec<&str> {
    contents
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}

struct FreeTextAppearance<'a> {
    alias: &'a str,
    font_id: ObjectId,
    rect: &'a [f32; 4],
    contents: &'a str,
    lines: &'a [AppearanceLine],
    style: &'a TextStyle,
    background_fill: Option<[f32; 4]>,
    border_color: [f32; 3],
    border_width: f32,
}

fn build_free_text_ap_stream(input: FreeTextAppearance<'_>) -> Result<Stream> {
    let FreeTextAppearance {
        alias,
        font_id,
        rect,
        contents,
        lines: appearance_lines,
        style,
        background_fill,
        border_color,
        border_width,
    } = input;
    let width = (rect[2] - rect[0]).abs().max(1.0);
    let height = (rect[3] - rect[1]).abs().max(1.0);
    let local_rect = [0.0, 0.0, width, height];
    let lines = free_text_lines(contents);
    let top_offset = textBlockOffset(
        local_rect,
        &lines,
        style.size_pt,
        style.line_height_multiplier,
        style.vertical_align,
    );
    let line_step = style.size_pt * style.line_height_multiplier;
    let first_baseline = height - top_offset - style.size_pt;

    let mut operations = vec![Operation::new("q", vec![])];
    let mut resources = lopdf::Dictionary::new();
    if let Some(fill) = background_fill {
        let mut ext_g_state = lopdf::Dictionary::new();
        ext_g_state.set(
            "BG",
            dictionary! {
                "Type" => "ExtGState",
                "ca" => fill[3].clamp(0.0, 1.0),
                "CA" => fill[3].clamp(0.0, 1.0),
            },
        );
        resources.set("ExtGState", Object::Dictionary(ext_g_state));
        operations.extend([
            Operation::new("q", vec![]),
            Operation::new("gs", vec![Object::Name(b"BG".to_vec())]),
            Operation::new(
                "rg",
                vec![
                    Object::Real(fill[0]),
                    Object::Real(fill[1]),
                    Object::Real(fill[2]),
                ],
            ),
            Operation::new(
                "re",
                vec![
                    Object::Real(0.0),
                    Object::Real(0.0),
                    Object::Real(width),
                    Object::Real(height),
                ],
            ),
            Operation::new("f", vec![]),
            Operation::new("Q", vec![]),
        ]);
    }
    if border_width > 0.0 {
        let half_width = border_width / 2.0;
        operations.extend([
            Operation::new(
                "RG",
                vec![
                    Object::Real(border_color[0]),
                    Object::Real(border_color[1]),
                    Object::Real(border_color[2]),
                ],
            ),
            Operation::new("w", vec![Object::Real(border_width)]),
            Operation::new(
                "re",
                vec![
                    Object::Real(half_width),
                    Object::Real(half_width),
                    Object::Real((width - border_width).max(0.0)),
                    Object::Real((height - border_width).max(0.0)),
                ],
            ),
            Operation::new("S", vec![]),
        ]);
    }
    operations.extend([
        Operation::new(
            "rg",
            vec![
                Object::Real(style.color[0]),
                Object::Real(style.color[1]),
                Object::Real(style.color[2]),
            ],
        ),
        Operation::new("BT", vec![]),
        Operation::new(
            "Tf",
            vec![
                Object::Name(alias.as_bytes().to_vec()),
                Object::Real(style.size_pt),
            ],
        ),
        Operation::new("Tc", vec![Object::Real(style.letter_spacing)]),
    ]);

    let mut line_layout = Vec::with_capacity(appearance_lines.len());
    for (index, line) in appearance_lines.iter().enumerate() {
        let spacing_count = line.character_count.saturating_sub(1) as f32;
        let line_width = (line.width_em * style.size_pt + spacing_count * style.letter_spacing)
            .min((width - 2.0 * FREE_TEXT_HORIZONTAL_INSET_PT).max(0.0));
        let x = aligned_line_x(width, line_width, style.align);
        let baseline = first_baseline - index as f32 * line_step;
        operations.push(Operation::new(
            "Tm",
            vec![
                Object::Real(1.0),
                Object::Real(0.0),
                Object::Real(0.0),
                Object::Real(1.0),
                Object::Real(x),
                Object::Real(baseline),
            ],
        ));
        operations.push(Operation::new(
            "Tj",
            vec![Object::String(
                line.bytes.clone(),
                StringFormat::Hexadecimal,
            )],
        ));
        line_layout.push((x, baseline, line_width));
    }
    operations.push(Operation::new("ET", vec![]));

    let thickness = (style.size_pt * DECORATION_THICKNESS_EM).max(0.5);
    if style.underline {
        add_decoration_rectangles(
            &mut operations,
            &line_layout,
            style.size_pt * UNDERLINE_OFFSET_EM,
            thickness,
        );
    }
    if style.strikethrough {
        add_decoration_rectangles(
            &mut operations,
            &line_layout,
            style.size_pt * STRIKETHROUGH_OFFSET_EM,
            thickness,
        );
    }
    operations.push(Operation::new("Q", vec![]));

    let mut font_resources = lopdf::Dictionary::new();
    font_resources.set(alias.as_bytes().to_vec(), Object::Reference(font_id));
    resources.set("Font", Object::Dictionary(font_resources));
    let content = Content { operations }.encode()?;

    Ok(Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "FormType" => 1i64,
            "BBox" => Object::Array(vec![
                Object::Real(0.0),
                Object::Real(0.0),
                Object::Real(width),
                Object::Real(height),
            ]),
            "Resources" => Object::Dictionary(resources),
        },
        content,
    ))
}

fn aligned_line_x(width: f32, line_width: f32, align: TextAlign) -> f32 {
    let content_width = (width - 2.0 * FREE_TEXT_HORIZONTAL_INSET_PT).max(0.0);
    match align {
        TextAlign::Left | TextAlign::Justify => FREE_TEXT_HORIZONTAL_INSET_PT,
        TextAlign::Center => FREE_TEXT_HORIZONTAL_INSET_PT + (content_width - line_width) / 2.0,
        TextAlign::Right => FREE_TEXT_HORIZONTAL_INSET_PT + content_width - line_width,
    }
}

fn standard_font_character_width(family: &str, character: char) -> f32 {
    if family == "Courier" {
        return 0.6;
    }

    match (family, character) {
        ("Times", ' ') => 0.25,
        ("Times", 'i' | 'l' | 'I' | 'j' | 't' | 'f') => 0.278,
        ("Times", 'M' | 'W') => 0.889,
        ("Times", _) => 0.5,
        (_, ' ') => 0.278,
        (_, 'i' | 'l' | 'I' | 'j' | 't' | 'f') => 0.278,
        (_, 'M') => 0.833,
        (_, 'W') => 0.944,
        (_, _) => 0.556,
    }
}

fn add_decoration_rectangles(
    operations: &mut Vec<Operation>,
    line_layout: &[(f32, f32, f32)],
    baseline_offset: f32,
    thickness: f32,
) {
    for (x, baseline, width) in line_layout {
        if *width <= 0.0 {
            continue;
        }
        operations.push(Operation::new(
            "re",
            vec![
                Object::Real(*x),
                Object::Real(*baseline + baseline_offset),
                Object::Real(*width),
                Object::Real(thickness),
            ],
        ));
        operations.push(Operation::new("f", vec![]));
    }
}

/// Read raw image bytes and embed as a `/Subtype /Image` XObject. JPEGs
/// are passed through with DCTDecode. Other formats decode to RGBA8, with
/// alpha stored as a DeviceGray soft mask so transparent signatures stay
/// transparent after saving.
fn embed_stamp_image(doc: &mut Document, path: &str) -> Result<ObjectId> {
    let bytes = std::fs::read(path).with_context(|| format!("read stamp image {path}"))?;
    let is_jpeg = bytes.starts_with(&[0xFF, 0xD8, 0xFF]);
    if is_jpeg {
        let image = image::load_from_memory(&bytes)
            .with_context(|| format!("decode stamp image {path}"))?;
        let (w, h) = (image.width(), image.height());
        let stream = Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w as i64,
                "Height" => h as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8i64,
                "Filter" => "DCTDecode",
            },
            bytes,
        );
        Ok(doc.add_object(Object::Stream(stream)))
    } else {
        let img = image::load_from_memory(&bytes)
            .with_context(|| format!("decode stamp image {path}"))?;
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        let mut rgb = Vec::with_capacity((w * h * 3) as usize);
        let mut alpha = Vec::with_capacity((w * h) as usize);
        for pixel in rgba.pixels() {
            rgb.extend_from_slice(&pixel.0[..3]);
            alpha.push(pixel.0[3]);
        }
        let soft_mask = Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w as i64,
                "Height" => h as i64,
                "ColorSpace" => "DeviceGray",
                "BitsPerComponent" => 8i64,
            },
            alpha,
        );
        let soft_mask_id = doc.add_object(Object::Stream(soft_mask));
        let mut image_dict = dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w as i64,
                "Height" => h as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8i64,
        };
        image_dict.set("SMask", Object::Reference(soft_mask_id));
        let stream = Stream::new(image_dict, rgb);
        Ok(doc.add_object(Object::Stream(stream)))
    }
}

/// Form XObject (appearance stream) drawing the image into the annotation rect.
fn build_image_ap_stream(
    image_id: ObjectId,
    rect: &[f32; 4],
    scale: f32,
    rotation_degrees: f32,
) -> Stream {
    let w = (rect[2] - rect[0]).abs().max(1.0);
    let h = (rect[3] - rect[1]).abs().max(1.0);
    let scale = scale.max(0.0);
    let radians = rotation_degrees.to_radians();
    let (sin, cos) = radians.sin_cos();
    let a = w * scale * cos;
    let b = w * scale * sin;
    let c = -h * scale * sin;
    let d = h * scale * cos;
    let e = w / 2.0 - (a + c) / 2.0;
    let f = h / 2.0 - (b + d) / 2.0;
    let content = format!("q\n{a:.6} {b:.6} {c:.6} {d:.6} {e:.6} {f:.6} cm\n/Im0 Do\nQ\n");
    let mut xobj = lopdf::Dictionary::new();
    xobj.set("Im0", Object::Reference(image_id));
    let mut resources = lopdf::Dictionary::new();
    resources.set("XObject", Object::Dictionary(xobj));
    Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "FormType" => 1i64,
            "BBox" => Object::Array(vec![
                Object::Real(0.0),
                Object::Real(0.0),
                Object::Real(w),
                Object::Real(h),
            ]),
            "Resources" => Object::Dictionary(resources),
        },
        content.into_bytes(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::text_style::{TextAlign, VerticalAlign};

    const STANDARD_FACES: &[(&str, &str, &str)] = &[
        ("Helvetica", "Helvetica", "Helv"),
        ("Helvetica", "Helvetica-Bold", "HelvB"),
        ("Helvetica", "Helvetica-Oblique", "HelvO"),
        ("Helvetica", "Helvetica-BoldOblique", "HelvBO"),
        ("Times", "Times-Roman", "TiR"),
        ("Times", "Times-Bold", "TiB"),
        ("Times", "Times-Italic", "TiI"),
        ("Times", "Times-BoldItalic", "TiBI"),
        ("Courier", "Courier", "Cou"),
        ("Courier", "Courier-Bold", "CouB"),
        ("Courier", "Courier-Oblique", "CouO"),
        ("Courier", "Courier-BoldOblique", "CouBO"),
    ];

    fn free_text(style: TextStyle, contents: &str) -> Annotation {
        Annotation::FreeText {
            page: 0,
            rect: [0.0, 0.0, 100.0, 40.0],
            contents: contents.to_string(),
            style,
            background_fill: None,
            border_color: [0.0, 0.0, 0.0],
            border_width: 0.0,
            auto_resize: false,
        }
    }

    fn build_free_text(style: TextStyle, contents: &str) -> (lopdf::Dictionary, Document) {
        let mut doc = Document::with_version("1.7");
        let (dict, _) = build_annot_dict(&free_text(style, contents), &mut doc)
            .expect("build FreeText annotation");
        (dict, doc)
    }

    fn appearance_content(dict: &lopdf::Dictionary, doc: &Document) -> Content {
        let ap = dict.get(b"AP").expect("/AP").as_dict().expect("/AP dict");
        let id = ap
            .get(b"N")
            .expect("/AP /N")
            .as_reference()
            .expect("/AP /N reference");
        let stream = doc
            .get_object(id)
            .expect("appearance object")
            .as_stream()
            .expect("appearance stream");
        Content::decode(&stream.content).expect("decode appearance")
    }

    fn number(object: &Object) -> f32 {
        match object {
            Object::Integer(value) => *value as f32,
            Object::Real(value) => *value,
            other => panic!("expected PDF number, got {other:?}"),
        }
    }

    #[test]
    fn failed_write_leaves_the_earlier_saved_copy_intact() {
        let folder = tempfile::tempdir().expect("scratch folder");
        let saved = folder.path().join("saved.pdf");
        std::fs::write(&saved, b"earlier saved copy").expect("seed the saved copy");

        let outcome = replace_file_atomically(&saved, |file| {
            std::io::Write::write_all(file, b"half a PDF")?;
            anyhow::bail!("disk full")
        });

        assert!(outcome.is_err());
        assert_eq!(std::fs::read(&saved).unwrap(), b"earlier saved copy");
        assert_eq!(
            std::fs::read_dir(folder.path()).unwrap().count(),
            1,
            "the temporary file is removed"
        );
    }

    #[test]
    fn successful_write_replaces_the_saved_copy() {
        let folder = tempfile::tempdir().expect("scratch folder");
        let saved = folder.path().join("saved.pdf");
        std::fs::write(&saved, b"earlier saved copy").expect("seed the saved copy");

        replace_file_atomically(&saved, |file| {
            std::io::Write::write_all(file, b"new saved copy")?;
            Ok(())
        })
        .expect("replace the saved copy");

        assert_eq!(std::fs::read(&saved).unwrap(), b"new saved copy");
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
    }

    fn cell_value(contents: &str) -> Annotation {
        Annotation::FreeText {
            page: 0,
            rect: [97.0, 626.0, 153.0, 640.0],
            contents: contents.to_string(),
            style: TextStyle::default(),
            background_fill: None,
            border_color: [0.0, 0.0, 0.0],
            border_width: 0.0,
            auto_resize: false,
        }
    }

    fn free_text_values(path: &Path) -> Vec<String> {
        let doc = crate::services::pdf_guard::load_guarded(path).expect("load saved copy");
        let page_id = *doc.get_pages().get(&1).expect("page 1");
        let annots = doc
            .get_dictionary(page_id)
            .and_then(|page| page.get(b"Annots"))
            .and_then(Object::as_array)
            .cloned()
            .unwrap_or_default();
        annots
            .iter()
            .filter_map(|annot| doc.dereference(annot).ok()?.1.as_dict().ok().cloned())
            .filter(|annot| {
                annot.get(b"Subtype").and_then(Object::as_name).ok() == Some(b"FreeText")
            })
            .map(|annot| lopdf::decode_text_string(annot.get(b"Contents").unwrap()).unwrap())
            .collect()
    }

    /// Plan 119 p1b: fill, save, edit the saved value, save, reopen: one
    /// value, the new one.
    #[test]
    fn an_edited_saved_value_replaces_the_old_annotation() {
        let folder = tempfile::tempdir().expect("scratch folder");
        let original = folder.path().join("form.pdf");
        let saved = folder.path().join("form.annotated.pdf");
        write_single_page_pdf(&original);

        let first =
            save_annotations(&original, &saved, &[cell_value("07:00")], &[]).expect("first save");
        let old = first[0].expect("written on page 1");
        let second =
            save_annotations(&saved, &saved, &[cell_value("08:30")], &[old]).expect("second save");

        assert_eq!(free_text_values(&saved), vec!["08:30".to_string()]);
        let doc = crate::services::pdf_guard::load_guarded(&saved).unwrap();
        assert!(
            doc.get_object((old.object, old.generation)).is_err(),
            "old object deleted"
        );
        assert!(second[0].is_some());
    }

    /// Plan 119 p1c: clearing a saved value deletes it. The save removes the
    /// old object and writes nothing, so the reopened file has no value in
    /// the cell and the cell reads as unfilled.
    #[test]
    fn an_empty_replacement_deletes_the_saved_value() {
        let folder = tempfile::tempdir().expect("scratch folder");
        let original = folder.path().join("form.pdf");
        let saved = folder.path().join("form.annotated.pdf");
        write_single_page_pdf(&original);
        let first =
            save_annotations(&original, &saved, &[cell_value("07:00")], &[]).expect("first save");
        let old = first[0].expect("written on page 1");

        let second = save_annotations(&saved, &saved, &[cell_value("")], &[old]).expect("clear");

        assert_eq!(second, vec![None], "nothing written for the empty value");
        assert!(
            free_text_values(&saved).is_empty(),
            "zero annotations in the cell"
        );
        let doc = crate::services::pdf_guard::load_guarded(&saved).unwrap();
        assert!(
            doc.get_object((old.object, old.generation)).is_err(),
            "old object deleted"
        );
    }

    /// Plan 119 p1c: a value of spaces is empty too, and a new empty fill
    /// (a clicked cell nobody typed into) is ignored, not written.
    #[test]
    fn a_new_empty_fill_is_ignored() {
        let folder = tempfile::tempdir().expect("scratch folder");
        let original = folder.path().join("form.pdf");
        let saved = folder.path().join("form.annotated.pdf");
        write_single_page_pdf(&original);

        let written = save_annotations(
            &original,
            &saved,
            &[cell_value(""), cell_value("  \n "), cell_value("08:30")],
            &[],
        )
        .expect("save");

        assert_eq!(written.len(), 3, "one result per input, in input order");
        assert!(written[0].is_none() && written[1].is_none() && written[2].is_some());
        assert_eq!(free_text_values(&saved), vec!["08:30".to_string()]);
    }

    /// Plan 119 p1c: only a text-less, undecorated FreeText counts as an
    /// empty fill. An empty box the user drew with a border or a background
    /// stays a visible shape and is written.
    #[test]
    fn an_empty_box_with_a_border_or_background_is_still_written() {
        let folder = tempfile::tempdir().expect("scratch folder");
        let original = folder.path().join("form.pdf");
        let saved = folder.path().join("form.annotated.pdf");
        write_single_page_pdf(&original);
        let mut bordered = cell_value("");
        let mut filled = cell_value("");
        if let Annotation::FreeText { border_width, .. } = &mut bordered {
            *border_width = 1.0;
        }
        if let Annotation::FreeText {
            background_fill, ..
        } = &mut filled
        {
            *background_fill = Some([1.0, 1.0, 0.0, 1.0]);
        }

        let written = save_annotations(&original, &saved, &[bordered, filled], &[]).expect("save");

        assert!(written.iter().all(Option::is_some));
        assert_eq!(free_text_values(&saved).len(), 2);
    }

    /// Plan 119 p1b: a value longer than its cell is clipped to the cell in
    /// the saved file. The appearance is one unwrapped line and its /BBox
    /// is the cell, which every conforming reader clips to.
    #[test]
    fn a_long_value_is_clipped_to_its_cell() {
        let mut doc = Document::with_version("1.7");
        let long = "Hlavna ulica 5, 943 01 Sturovo, Slovenska republika";
        let (dict, _) = build_annot_dict(&cell_value(long), &mut doc).expect("build FreeText");
        let ap = dict.get(b"AP").and_then(Object::as_dict).expect("/AP");
        let stream = doc
            .get_object(ap.get(b"N").and_then(Object::as_reference).expect("/N"))
            .and_then(Object::as_stream)
            .expect("appearance stream");
        let bbox: Vec<f32> = stream
            .dict
            .get(b"BBox")
            .and_then(Object::as_array)
            .expect("/BBox")
            .iter()
            .map(number)
            .collect();
        assert_eq!(bbox, vec![0.0, 0.0, 56.0, 14.0]);
        let content = Content::decode(&stream.content).expect("decode appearance");
        let shows = content
            .operations
            .iter()
            .filter(|op| op.operator == "Tj")
            .count();
        assert_eq!(shows, 1, "one line: the value is clipped, not wrapped");
    }

    #[test]
    fn encode_win_ansi_saris_uses_windows_extra_codes() {
        assert_eq!(
            encode_win_ansi("Šariš"),
            Ok(vec![0x8a, b'a', b'r', b'i', 0x9a])
        );
    }

    #[test]
    fn encode_win_ansi_zilina_uses_windows_extra_code() {
        assert_eq!(
            encode_win_ansi("Žilina"),
            Ok(vec![0x8e, b'i', b'l', b'i', b'n', b'a'])
        );
    }

    #[test]
    fn encode_win_ansi_dlzka_returns_first_unencodable_character() {
        assert_eq!(encode_win_ansi("dĺžka"), Err('ĺ'));
    }

    #[test]
    fn standard_14_plan_keeps_win_ansi_zilina_on_type1_face() {
        let plan = standard_14_text_plan("Helvetica-Bold", "Žilina", Vec::new());

        match plan {
            Standard14TextPlan::Type1 {
                appearance_text,
                replaced_character,
            } => {
                assert_eq!(appearance_text, "Žilina");
                assert_eq!(replaced_character, None);
            }
            Standard14TextPlan::Embedded(font) => {
                panic!("Žilina unexpectedly selected embedded {}", font.family)
            }
        }
    }

    #[test]
    fn standard_14_plan_uses_matching_fallback_for_dlzka() {
        let arial_bold = SystemFont {
            family: "Arial".to_string(),
            postscript_name: "Arial-BoldMT".to_string(),
            style: "Bold".to_string(),
            weight: 700,
            italic: false,
            monospace: false,
            file_path: "arial-bold.ttf".to_string(),
            is_standard_14: false,
        };

        let plan = standard_14_text_plan("Helvetica-Bold", "dĺžka", vec![arial_bold]);

        match plan {
            Standard14TextPlan::Embedded(font) => {
                assert_eq!(font.family, "Arial");
                assert_eq!(font.style, "Bold");
            }
            Standard14TextPlan::Type1 { .. } => {
                panic!("dĺžka must use the installed Arial Bold fallback")
            }
        }
    }

    #[test]
    fn standard_14_plan_replaces_only_unencodable_characters_without_fallback() {
        let plan = standard_14_text_plan("Helvetica-Bold", "dĺžka čaj", Vec::new());

        match plan {
            Standard14TextPlan::Type1 {
                appearance_text,
                replaced_character,
            } => {
                assert_eq!(appearance_text, "d?žka ?aj");
                assert_eq!(replaced_character, Some('ĺ'));
                assert_eq!(
                    encode_win_ansi(&appearance_text),
                    Ok(b"d?\x9eka ?aj".to_vec())
                );
            }
            Standard14TextPlan::Embedded(font) => {
                panic!("missing fallback unexpectedly selected {}", font.family)
            }
        }
    }

    #[test]
    fn pdf_text_string_uses_pdf_doc_encoding_when_all_characters_fit() {
        let encoded = pdf_text_string("Šariš €");

        match encoded {
            Object::String(bytes, StringFormat::Literal) => {
                assert_eq!(bytes, vec![0x97, b'a', b'r', b'i', 0x9d, b' ', 0xa0]);
            }
            other => panic!("expected literal PDFDocEncoding string, got {other:?}"),
        }
    }

    #[test]
    fn pdf_text_string_uses_utf16be_with_bom_when_pdf_doc_encoding_cannot_fit() {
        let encoded = pdf_text_string("Ľubomír");

        match encoded {
            Object::String(bytes, StringFormat::Hexadecimal) => {
                assert_eq!(
                    bytes,
                    vec![
                        0xfe, 0xff, 0x01, 0x3d, 0x00, 0x75, 0x00, 0x62, 0x00, 0x6f, 0x00, 0x6d,
                        0x00, 0xed, 0x00, 0x72,
                    ]
                );
            }
            other => panic!("expected hexadecimal UTF-16BE string, got {other:?}"),
        }
    }

    #[test]
    fn standard_faces_emit_expected_alias_and_type1_resource() {
        for &(family, postscript_name, alias) in STANDARD_FACES {
            let style = TextStyle {
                font_family: family.to_string(),
                font_postscript_name: postscript_name.to_string(),
                size_pt: 10.0,
                ..TextStyle::default()
            };
            let (dict, doc) = build_free_text(style, "Text");

            let da = dict.get(b"DA").expect("/DA").as_str().expect("/DA string");
            assert_eq!(
                std::str::from_utf8(da).expect("UTF-8 /DA"),
                format!("/{alias} 10 Tf 0 0 0 rg"),
                "wrong /DA for {postscript_name}"
            );

            let dr = dict.get(b"DR").expect("/DR").as_dict().expect("/DR dict");
            let fonts = dr
                .get(b"Font")
                .expect("/DR /Font")
                .as_dict()
                .expect("/Font dict");
            let font_id = fonts
                .get(alias.as_bytes())
                .expect("font alias")
                .as_reference()
                .expect("font reference");
            let font = doc
                .get_object(font_id)
                .expect("font object")
                .as_dict()
                .expect("font dictionary");
            assert_eq!(
                font.get(b"Subtype").expect("/Subtype").as_name().unwrap(),
                b"Type1",
                "wrong font subtype for {postscript_name}"
            );
            assert_eq!(
                font.get(b"BaseFont").expect("/BaseFont").as_name().unwrap(),
                postscript_name.as_bytes(),
                "wrong /BaseFont for {postscript_name}"
            );

            let appearance = appearance_content(&dict, &doc);
            let tf_alias = appearance
                .operations
                .iter()
                .find(|operation| operation.operator == "Tf")
                .expect("appearance /Tf")
                .operands[0]
                .as_name()
                .expect("appearance font alias");
            assert_eq!(
                tf_alias,
                alias.as_bytes(),
                "wrong AP alias for {postscript_name}"
            );
        }
    }

    #[test]
    fn horizontal_alignment_emits_matching_q_and_text_position() {
        let cases = [
            (TextAlign::Left, 0, 2.0),
            (TextAlign::Center, 1, 41.67),
            (TextAlign::Right, 2, 81.34),
        ];

        for (align, expected_q, expected_x) in cases {
            let style = TextStyle {
                size_pt: 10.0,
                align,
                ..TextStyle::default()
            };
            let (dict, doc) = build_free_text(style, "MM");
            assert_eq!(
                dict.get(b"Q").expect("/Q").as_i64().expect("integer /Q"),
                expected_q
            );

            let appearance = appearance_content(&dict, &doc);
            let tm = appearance
                .operations
                .iter()
                .find(|operation| operation.operator == "Tm")
                .expect("text matrix");
            assert!(
                (number(&tm.operands[4]) - expected_x).abs() < 0.01,
                "appearance X does not match /Q {expected_q}"
            );
        }
    }

    #[test]
    fn underline_draws_one_rectangle_per_line_at_minus_point_twelve_em() {
        let style = TextStyle {
            size_pt: 10.0,
            underline: true,
            ..TextStyle::default()
        };
        let (dict, doc) = build_free_text(style, "first\nsecond");
        let appearance = appearance_content(&dict, &doc);
        let rectangles: Vec<&Operation> = appearance
            .operations
            .iter()
            .filter(|operation| operation.operator == "re")
            .collect();

        assert_eq!(rectangles.len(), 2);
        assert!((number(&rectangles[0].operands[1]) - 28.8).abs() < 0.01);
        assert!((number(&rectangles[1].operands[1]) - 16.8).abs() < 0.01);
        assert!((number(&rectangles[0].operands[3]) - 0.6).abs() < 0.01);
    }

    #[test]
    fn strikethrough_draws_one_rectangle_per_line_at_point_three_em() {
        let style = TextStyle {
            size_pt: 10.0,
            strikethrough: true,
            ..TextStyle::default()
        };
        let (dict, doc) = build_free_text(style, "first\nsecond");
        let appearance = appearance_content(&dict, &doc);
        let rectangles: Vec<&Operation> = appearance
            .operations
            .iter()
            .filter(|operation| operation.operator == "re")
            .collect();

        assert_eq!(rectangles.len(), 2);
        assert!((number(&rectangles[0].operands[1]) - 33.0).abs() < 0.01);
        assert!((number(&rectangles[1].operands[1]) - 21.0).abs() < 0.01);
    }

    #[test]
    fn decorations_off_emit_no_rectangle_operators() {
        let (dict, doc) = build_free_text(TextStyle::default(), "first\nsecond");
        let appearance = appearance_content(&dict, &doc);

        assert!(
            appearance
                .operations
                .iter()
                .all(|operation| operation.operator != "re"),
            "plain text appearance must not contain decoration rectangles"
        );
    }

    #[test]
    fn middle_vertical_alignment_moves_first_baseline_by_shared_offset() {
        let style = TextStyle {
            size_pt: 10.0,
            vertical_align: VerticalAlign::Middle,
            ..TextStyle::default()
        };
        let (dict, doc) = build_free_text(style, "first\nsecond");
        let appearance = appearance_content(&dict, &doc);
        let first_tm = appearance
            .operations
            .iter()
            .find(|operation| operation.operator == "Tm")
            .expect("first text matrix");

        assert_eq!(number(&first_tm.operands[5]), 22.0);
    }

    fn write_single_page_pdf(path: &Path) {
        let mut doc = Document::with_version("1.7");
        let page_id = doc.new_object_id();
        let pages_id = doc.new_object_id();
        let catalog_id = doc.new_object_id();
        doc.set_object(
            page_id,
            dictionary! {
                "Type" => "Page",
                "Parent" => Object::Reference(pages_id),
                "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
                "Resources" => dictionary! {},
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
            catalog_id,
            dictionary! {
                "Type" => "Catalog",
                "Pages" => Object::Reference(pages_id),
            },
        );
        doc.trailer.set("Root", Object::Reference(catalog_id));
        doc.save(path).expect("save one-page PDF fixture");
    }

    #[test]
    fn transparent_png_round_trip_keeps_soft_mask_and_rotated_scaled_matrix() {
        let directory = tempfile::tempdir().expect("create isolated stamp fixture");
        let input = directory.path().join("input.pdf");
        let output = directory.path().join("output.pdf");
        let png_path = directory.path().join("transparent.png");
        write_single_page_pdf(&input);
        image::RgbaImage::from_raw(
            2,
            2,
            vec![
                255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 128, 255, 255, 255, 64,
            ],
        )
        .expect("valid RGBA fixture")
        .save(&png_path)
        .expect("save transparent PNG fixture");

        apply_annotations(
            &input,
            &output,
            &[Annotation::Stamp {
                page: 0,
                rect: [10.0, 20.0, 210.0, 120.0],
                image_path: png_path.to_string_lossy().into_owned(),
                scale: 0.5,
                rotation: 90.0,
                opacity: 1.0,
            }],
        )
        .expect("apply transparent stamp");

        let saved = crate::services::pdf_guard::load_guarded(&output)
            .expect("load annotated output through the PDF guard");
        let page_id = saved.get_pages()[&1];
        let page = saved.get_dictionary(page_id).expect("page dictionary");
        let annotation_id = page
            .get(b"Annots")
            .expect("page annotations")
            .as_array()
            .expect("annotations array")[0]
            .as_reference()
            .expect("stamp reference");
        let annotation = saved
            .get_dictionary(annotation_id)
            .expect("stamp dictionary");
        let appearance_id = annotation
            .get(b"AP")
            .expect("appearance dictionary")
            .as_dict()
            .expect("appearance dictionary")
            .get(b"N")
            .expect("normal appearance")
            .as_reference()
            .expect("normal appearance reference");
        let appearance = saved
            .get_object(appearance_id)
            .expect("appearance object")
            .as_stream()
            .expect("appearance stream");
        let image_id = appearance
            .dict
            .get(b"Resources")
            .expect("appearance resources")
            .as_dict()
            .expect("resources dictionary")
            .get(b"XObject")
            .expect("image resources")
            .as_dict()
            .expect("image dictionary")
            .get(b"Im0")
            .expect("stamp image")
            .as_reference()
            .expect("stamp image reference");
        let image = saved
            .get_object(image_id)
            .expect("image object")
            .as_stream()
            .expect("image stream");
        assert!(
            image.dict.get(b"SMask").is_ok(),
            "the PNG alpha channel must be preserved through /SMask"
        );

        let content = Content::decode(&appearance.content).expect("decode appearance content");
        let matrix = content
            .operations
            .iter()
            .find(|operation| operation.operator == "cm")
            .expect("image appearance matrix");
        let values: Vec<f32> = matrix.operands.iter().map(number).collect();
        assert!((values[0] - 0.0).abs() < 0.01, "90-degree matrix a");
        assert!((values[1] - 100.0).abs() < 0.01, "90-degree matrix b");
        assert!((values[2] + 50.0).abs() < 0.01, "90-degree matrix c");
        assert!((values[3] - 0.0).abs() < 0.01, "90-degree matrix d");
        assert!((values[4] - 125.0).abs() < 0.01, "centred matrix x");
        assert!((values[5] - 0.0).abs() < 0.01, "centred matrix y");
    }

    #[test]
    fn missing_stamp_image_returns_an_error_instead_of_a_placeholder() {
        let mut doc = Document::with_version("1.7");
        let annotation = Annotation::Stamp {
            page: 0,
            rect: [0.0, 0.0, 100.0, 50.0],
            image_path: "definitely-missing-signature.png".to_string(),
            scale: 1.0,
            rotation: 0.0,
            opacity: 1.0,
        };

        let error = build_annot_dict(&annotation, &mut doc).expect_err("missing image must fail");
        assert!(
            error.to_string().contains("read stamp image"),
            "failure should identify the unreadable stamp: {error:#}"
        );
    }
}
