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
use lopdf::{dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::services::font_embed::FontSubsetter;
use crate::services::fonts::{find_by_postscript_name, is_standard_14};
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
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
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

            // An explicit appearance makes the saved PDF use the same
            // horizontal and vertical placement as the pending preview.
            // /Q remains present for viewers that regenerate the appearance.
            let ap_stream = build_free_text_ap_stream(FreeTextAppearance {
                alias: &alias,
                font_id,
                rect,
                contents,
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

    let mut line_layout = Vec::with_capacity(lines.len());
    for (index, line) in lines.iter().enumerate() {
        let line_width = estimated_line_width(line, style)
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
            vec![Object::string_literal((*line).to_string())],
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

fn estimated_line_width(line: &str, style: &TextStyle) -> f32 {
    let em_width: f32 = line
        .chars()
        .map(|character| standard_font_character_width(&style.font_family, character))
        .sum();
    let spacing_count = line.chars().count().saturating_sub(1) as f32;
    em_width * style.size_pt + spacing_count * style.letter_spacing
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
}
