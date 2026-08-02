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
use lopdf::{dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::services::font_embed::FontSubsetter;
use crate::services::fonts::{find_by_postscript_name, is_standard_14};
use crate::services::text_style::{TextAlign, TextStyle};

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

pub fn apply_annotations(input: &Path, output: &Path, annotations: &[Annotation]) -> Result<()> {
    let mut doc = Document::load(input)?;
    let pages = doc.get_pages();
    for ann in annotations {
        let page_num = annotation_page(ann);
        let Some(&page_id) = pages.get(&(page_num + 1)) else {
            continue;
        };
        let (dict, font_binding) = build_annot_dict(ann, &mut doc)?;
        let annot_id = doc.add_object(Object::Dictionary(dict));
        if let Some(obj) = doc.objects.get_mut(&page_id) {
            if let Ok(p) = obj.as_dict_mut() {
                let mut annots: Vec<Object> = match p.get(b"Annots").cloned() {
                    Ok(Object::Array(a)) => a,
                    _ => Vec::new(),
                };
                annots.push(Object::Reference(annot_id));
                p.set("Annots", annots);

                // Bind any embedded font to the page's /Resources /Font.
                if let Some((alias, font_id)) = font_binding {
                    ensure_page_font(p, &alias, font_id);
                }
            }
        }
    }
    doc.compress();
    doc.save(output)?;
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
        | Annotation::Ink { page, .. } => *page,
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
            d.set("Contents", Object::string_literal(contents.clone()));
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
            d.set("Contents", Object::string_literal(contents.clone()));
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

            // Resolve the font reference. Standard 14 gets a Type1 dict;
            // anything else is embedded as Type0 CIDFont via FontSubsetter.
            let (alias, font_id) = if is_standard_14(&style.font_postscript_name) {
                let alias = font_alias_for_ps(&style.font_postscript_name);
                let font_id = doc.add_object(dictionary! {
                    "Type" => "Font",
                    "Subtype" => "Type1",
                    "BaseFont" => Object::Name(style.font_postscript_name.as_bytes().to_vec()),
                    "Encoding" => "WinAnsiEncoding",
                });
                (alias, font_id)
            } else {
                let sys =
                    find_by_postscript_name(&style.font_postscript_name).with_context(|| {
                        format!(
                            "font not installed on this system: {}",
                            style.font_postscript_name
                        )
                    })?;
                if sys.file_path.is_empty() {
                    anyhow::bail!(
                        "font {} has no file path; cannot embed",
                        style.font_postscript_name
                    );
                }
                let mut sub = FontSubsetter::new_from_path(std::path::Path::new(&sys.file_path))?;
                sub.add_text(contents);
                let (font_id, tag) = sub.write_to_pdf(doc)?;
                // PDF-safe resource alias: tag prefix + simple variant.
                let alias = format!("F{}", &tag[..3]);
                (alias, font_id)
            };

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

            Ok((d, Some((alias, font_id))))
        }
        Annotation::Stamp {
            rect,
            image_path,
            scale: _,
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
            if let Ok(image_id) = embed_stamp_image(doc, image_path) {
                let ap_stream = build_image_ap_stream(image_id, rect);
                let ap_id = doc.add_object(Object::Stream(ap_stream));
                let mut ap = lopdf::Dictionary::new();
                ap.set("N", Object::Reference(ap_id));
                d.set("AP", Object::Dictionary(ap));
            }
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

/// Insert (alias -> font_id) into page.Resources.Font, creating
/// intermediate dictionaries as needed.
fn ensure_page_font(page: &mut lopdf::Dictionary, alias: &str, font_id: ObjectId) {
    let res = match page.get_mut(b"Resources") {
        Ok(Object::Dictionary(r)) => r,
        _ => {
            page.set("Resources", Object::Dictionary(lopdf::Dictionary::new()));
            match page.get_mut(b"Resources") {
                Ok(Object::Dictionary(r)) => r,
                _ => return,
            }
        }
    };
    let fonts = match res.get_mut(b"Font") {
        Ok(Object::Dictionary(f)) => f,
        _ => {
            res.set("Font", Object::Dictionary(lopdf::Dictionary::new()));
            match res.get_mut(b"Font") {
                Ok(Object::Dictionary(f)) => f,
                _ => return,
            }
        }
    };
    fonts.set(alias.as_bytes().to_vec(), Object::Reference(font_id));
}

/// Read raw image bytes and embed as a `/Subtype /Image` XObject. JPEGs
/// are passed through with DCTDecode; other formats decode to RGB8 and
/// store uncompressed (lopdf applies FlateDecode on save).
fn embed_stamp_image(doc: &mut Document, path: &str) -> Result<ObjectId> {
    let bytes = std::fs::read(path).with_context(|| format!("read stamp image {path}"))?;
    let is_jpeg = bytes.starts_with(&[0xFF, 0xD8, 0xFF]);
    if is_jpeg {
        let (w, h) = image::load_from_memory(&bytes)
            .map(|img| (img.width(), img.height()))
            .unwrap_or((100, 100));
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
        let rgb = img.to_rgb8();
        let (w, h) = rgb.dimensions();
        let raw = rgb.into_raw();
        let stream = Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w as i64,
                "Height" => h as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8i64,
            },
            raw,
        );
        Ok(doc.add_object(Object::Stream(stream)))
    }
}

/// Form XObject (appearance stream) drawing the image into the annotation rect.
fn build_image_ap_stream(image_id: ObjectId, rect: &[f32; 4]) -> Stream {
    let w = (rect[2] - rect[0]).abs().max(1.0);
    let h = (rect[3] - rect[1]).abs().max(1.0);
    let content = format!("q\n{w} 0 0 {h} 0 0 cm\n/Im0 Do\nQ\n", w = w, h = h);
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
