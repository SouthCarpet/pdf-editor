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
    /// Vertical placement of the complete line block inside its rectangle.
    /// Defaults to top so TextStyle JSON written before this field existed
    /// keeps loading with the original placement.
    #[serde(default)]
    pub vertical_align: VerticalAlign,
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

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    #[default]
    Top,
    Middle,
    Bottom,
}

/// Offset from the rectangle's top edge to the top of the complete text
/// block. `line_height` is a multiplier, matching TextStyle. Any free
/// vertical space is assigned 0%, 50%, or 100% to top/middle/bottom.
pub fn text_block_offset(
    rect: [f32; 4],
    lines: &[&str],
    font_size: f32,
    line_height: f32,
    vertical_align: VerticalAlign,
) -> f32 {
    let rect_height = (rect[3] - rect[1]).abs();
    let line_count = lines.len().max(1) as f32;
    let block_height = line_count * font_size.max(0.0) * line_height.max(0.0);
    let free_space = (rect_height - block_height).max(0.0);

    match vertical_align {
        VerticalAlign::Top => 0.0,
        VerticalAlign::Middle => free_space / 2.0,
        VerticalAlign::Bottom => free_space,
    }
}

// The TypeScript counterpart is intentionally named textBlockOffset. This
// public alias keeps the cross-language contract searchable by the same name
// without giving the Rust implementation a non-idiomatic function name.
pub use text_block_offset as textBlockOffset;

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
            vertical_align: VerticalAlign::Top,
            letter_spacing: 0.0,
            line_height_multiplier: 1.2,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{textBlockOffset, VerticalAlign};

    const RECT: [f32; 4] = [0.0, 0.0, 100.0, 40.0];
    const LINES: &[&str] = &["first", "second"];

    #[test]
    fn text_block_offset_two_lines_top_returns_zero() {
        assert_eq!(
            textBlockOffset(RECT, LINES, 10.0, 1.2, VerticalAlign::Top),
            0.0
        );
    }

    #[test]
    fn text_block_offset_two_lines_middle_returns_half_free_space() {
        assert_eq!(
            textBlockOffset(RECT, LINES, 10.0, 1.2, VerticalAlign::Middle),
            8.0
        );
    }

    #[test]
    fn text_block_offset_two_lines_bottom_returns_all_free_space() {
        assert_eq!(
            textBlockOffset(RECT, LINES, 10.0, 1.2, VerticalAlign::Bottom),
            16.0
        );
    }

    #[test]
    fn missing_vertical_align_deserializes_as_top() {
        let json = r#"{
            "font_family":"Helvetica",
            "font_postscript_name":"Helvetica",
            "size_pt":11.0,
            "bold":false,
            "italic":false,
            "underline":false,
            "strikethrough":false,
            "color":[0.0,0.0,0.0],
            "background":null,
            "align":"left",
            "letter_spacing":0.0,
            "line_height_multiplier":1.2
        }"#;

        let style: super::TextStyle = serde_json::from_str(json).expect("legacy TextStyle JSON");
        assert!(matches!(style.vertical_align, VerticalAlign::Top));
    }
}
