// Delta U — shared TextStyle struct, used wherever a tool produces text.
//
// FreeText annotation, AcroForm text field default-value rendering, Tier 3
// inline edit style override, Watermark text mode — all share this payload
// so the frontend can reuse a single FontPicker component.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TextStyle {
    /// Display family ("Arial", "Helvetica", ...). UI display only; the
    /// authoritative font identifier is `font_postscript_name`.
    pub font_family: String,
    /// Specific face ("Helvetica-Bold", "Arial-Italic"). When this is one of
    /// the 14 Standard PDF fonts, the save path emits a Type1 reference.
    /// Otherwise the save path locates the font file via `services::fonts::
    /// find_by_postscript_name` and embeds it as a Type0 CIDFont via
    /// `services::font_embed`. Never silently falls back to Helvetica.
    pub font_postscript_name: String,
    /// Font size in PDF points (6.0 to 200.0).
    pub size_pt: f32,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
    /// Text color, RGB in 0..1 range.
    pub color: [f32; 3],
    /// Optional text highlight background, RGBA in 0..1 (alpha in `[3]`).
    pub background: Option<[f32; 4]>,
    pub align: TextAlign,
    /// Letter spacing in PDF points (`Tc`). 0 = default.
    pub letter_spacing: f32,
    /// Line height multiplier. 1.0 = single, 1.5 = 1.5x, etc.
    pub line_height_multiplier: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    Left,
    Center,
    Right,
    Justify,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            font_family: "Helvetica".to_string(),
            font_postscript_name: "Helvetica".to_string(),
            size_pt: 11.0,
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            color: [0.0, 0.0, 0.0],
            background: None,
            align: TextAlign::Left,
            letter_spacing: 0.0,
            line_height_multiplier: 1.2,
        }
    }
}
