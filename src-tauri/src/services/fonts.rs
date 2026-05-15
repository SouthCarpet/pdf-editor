// Delta U — system font enumeration.
//
// Returns a sorted, deduplicated list of installed font families plus the 14
// Standard PDF fonts (always renderable, no embedding required). The result
// is cached in `AppState::fonts` so the picker's combobox stays snappy on
// repeated mounts.
//
// On Windows, `font-kit::source::SystemSource` uses DirectWrite. The
// `is_standard_14` flag tells the backend whether the font can be referenced
// by name (Type1) or must be embedded as a Type0 CIDFont (Delta U: REAL
// embedding via `services::font_embed`). There is no automatic fallback from
// a non-Standard-14 selection to Standard 14: if the font cannot be located
// on disk, the save path returns `AppError::Internal` with a clear message.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SystemFont {
    pub family: String,
    pub postscript_name: String,
    /// "Regular" / "Bold" / "Italic" / "BoldItalic" / "standard14".
    pub style: String,
    /// CSS-style numeric weight, 100..900. 400 = regular, 700 = bold.
    pub weight: u16,
    pub italic: bool,
    pub monospace: bool,
    /// Absolute filesystem path of the font file (empty for Standard 14).
    pub file_path: String,
    /// True for the 14 PDF native fonts; these never need embedding.
    pub is_standard_14: bool,
}

/// Standard 14 PDF fonts. These are always renderable without embedding.
/// (family, postscript_name, style, weight, italic, monospace)
const STANDARD_14: &[(&str, &str, &str, u16, bool, bool)] = &[
    ("Helvetica", "Helvetica", "Regular", 400, false, false),
    ("Helvetica", "Helvetica-Bold", "Bold", 700, false, false),
    ("Helvetica", "Helvetica-Oblique", "Italic", 400, true, false),
    (
        "Helvetica",
        "Helvetica-BoldOblique",
        "BoldItalic",
        700,
        true,
        false,
    ),
    ("Times", "Times-Roman", "Regular", 400, false, false),
    ("Times", "Times-Bold", "Bold", 700, false, false),
    ("Times", "Times-Italic", "Italic", 400, true, false),
    ("Times", "Times-BoldItalic", "BoldItalic", 700, true, false),
    ("Courier", "Courier", "Regular", 400, false, true),
    ("Courier", "Courier-Bold", "Bold", 700, false, true),
    ("Courier", "Courier-Oblique", "Italic", 400, true, true),
    (
        "Courier",
        "Courier-BoldOblique",
        "BoldItalic",
        700,
        true,
        true,
    ),
    ("Symbol", "Symbol", "Regular", 400, false, false),
    ("ZapfDingbats", "ZapfDingbats", "Regular", 400, false, false),
];

fn standard_14_fonts() -> Vec<SystemFont> {
    STANDARD_14
        .iter()
        .map(
            |(family, ps, style, weight, italic, monospace)| SystemFont {
                family: (*family).to_string(),
                postscript_name: (*ps).to_string(),
                style: (*style).to_string(),
                weight: *weight,
                italic: *italic,
                monospace: *monospace,
                file_path: String::new(),
                is_standard_14: true,
            },
        )
        .collect()
}

/// Enumerate every font installed on the host machine. Standard 14 PDF fonts
/// appear first; system fonts follow, sorted by family name then
/// postscript_name. The Type0 CIDFont embedding path in `font_embed.rs`
/// expects each non-Standard-14 entry to have a non-empty `file_path`.
pub fn list_system_fonts() -> Vec<SystemFont> {
    let mut out = standard_14_fonts();
    out.extend(enumerate_with_font_kit().unwrap_or_default());
    // Dedupe by (family, postscript_name) — DirectWrite can hand out the
    // same face twice when both DWriteFactory variants list it.
    let mut seen = std::collections::HashSet::new();
    out.retain(|f| seen.insert((f.family.clone(), f.postscript_name.clone())));
    out
}

fn enumerate_with_font_kit() -> Option<Vec<SystemFont>> {
    use font_kit::handle::Handle;
    use font_kit::properties::Style;
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let families = source.all_families().ok()?;
    let mut out: Vec<SystemFont> = Vec::with_capacity(families.len() * 2);
    for family_name in families {
        let Ok(family) = source.select_family_by_name(&family_name) else {
            continue;
        };
        for handle in family.fonts() {
            // Capture path BEFORE consuming handle via load().
            let file_path = match handle {
                Handle::Path { path, .. } => path.display().to_string(),
                Handle::Memory { .. } => String::new(),
            };
            if let Ok(font) = handle.load() {
                let ps = font.postscript_name().unwrap_or_default();
                let props = font.properties();
                let italic = matches!(props.style, Style::Italic | Style::Oblique);
                let weight = props.weight.0 as u16;
                let monospace = font.is_monospace();
                let style = match (italic, weight >= 600) {
                    (true, true) => "BoldItalic",
                    (true, false) => "Italic",
                    (false, true) => "Bold",
                    (false, false) => "Regular",
                };
                out.push(SystemFont {
                    family: family_name.clone(),
                    postscript_name: ps,
                    style: style.to_string(),
                    weight,
                    italic,
                    monospace,
                    file_path,
                    is_standard_14: false,
                });
            }
        }
    }
    out.sort_by(|a, b| {
        a.family
            .cmp(&b.family)
            .then(a.postscript_name.cmp(&b.postscript_name))
    });
    Some(out)
}

/// Look up a font by its PostScript name. Returns `None` if the name is not
/// in the system enumeration. Standard 14 entries have an empty `file_path`;
/// callers must check `is_standard_14` before assuming a file exists.
pub fn find_by_postscript_name(name: &str) -> Option<SystemFont> {
    list_system_fonts()
        .into_iter()
        .find(|f| f.postscript_name == name)
}

/// True if `postscript_name` is one of the 14 native PDF fonts.
pub fn is_standard_14(postscript_name: &str) -> bool {
    STANDARD_14
        .iter()
        .any(|(_, ps, _, _, _, _)| *ps == postscript_name)
}
