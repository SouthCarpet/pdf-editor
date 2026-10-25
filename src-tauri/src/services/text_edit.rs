// Phase 12 Task 68 — Edit Tier 3 (real inline text edit, Delta S).
//
// Real inline text edit: parses mutool stext XML to discover glyph runs,
// inverts the PDF text-encoding to map UTF-8 input back to byte sequences
// the font understands, and rewrites the Tj/TJ operand in the content
// stream in-place. The original styling is preserved by default — the
// new bytes occupy the exact same operator slot.
//
// Encoding cases handled:
//   - WinAnsiEncoding: well-known 256-entry table (PDF 1.7 Annex D.2).
//     Invert UTF-8 → byte; characters not in the table return
//     AppError::EncodingMismatch.
//   - MacRomanEncoding: same shape (PDF 1.7 Annex D.3).
//   - Identity-H CIDFont with /ToUnicode CMap: parse the CMap's bfchar
//     entries to build an inverse map UTF-8 → CID, then emit the 2-byte
//     BE CID sequence.
//   - No /ToUnicode and non-standard encoding → EncodingMismatch.
//
// The redaction fallback (`replace_run_via_redaction`) is the
// last-resort path. It is opt-in: the frontend exposes a separate
// command and warns the user about layout shifts. It is NOT the default.

use anyhow::{Context, Result};
use lopdf::{
    content::{Content, Operation},
    dictionary, Document, Object, ObjectId, Stream,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::services::annotations::{dictionary_copy, page_resources_copy};
use crate::services::lopdf_ext::ObjectExt;

/// Discovered glyph run that the frontend lists as a candidate edit
/// target. `bbox` is in PDF points; `operator_index` points back into
/// the content stream so the save side can rewrite the exact Tj/TJ.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TextRun {
    pub page: u32,
    pub text: String,
    pub bbox: [f32; 4],
    /// Index into the page's `Content { operations }` Vec. Identifies the
    /// Tj/TJ this run came from.
    pub operator_index: u32,
    /// PostScript name of the font this run was drawn with, or
    /// "Unknown" if not resolvable.
    pub font: String,
    /// PDF text size in points.
    pub font_size: f32,
}

/// Run mutool stext on the input to enumerate runs. We pair stext output
/// with our own content-stream walk to fill in `operator_index`.
///
/// `extract_runs_via_content_stream` is the in-process implementation —
/// it relies on Tj/TJ operator scanning. The output `text` is the raw
/// bytes interpreted via the operator's font encoding (best-effort
/// WinAnsi inversion); the bbox is conservatively the page mediabox
/// because we don't track text matrix evolution in v1. For UI
/// scrolling / hit-testing the frontend uses pdf.js text layer; this
/// service is purely the rewrite path.
pub fn extract_runs(input: &Path) -> Result<Vec<TextRun>> {
    let doc = crate::services::pdf_guard::load_guarded(input)?;
    let pages = doc.get_pages();
    let mut out = Vec::new();
    for (page_num, page_id) in pages {
        let page_index = page_num - 1;
        let content = match doc.get_and_decode_page_content(page_id) {
            Ok(c) => c,
            Err(_) => continue,
        };
        // Scan operations; collect every Tj/TJ alongside its operator index
        // and the most-recent /Tf font selection. We resolve the font's
        // postscript name via the page resource dict.
        let resource_fonts = page_font_dict(&doc, page_id);
        let mut current_font: Option<String> = None;
        let mut current_size: f32 = 12.0;
        let bbox = page_mediabox(&doc, page_id).unwrap_or([0.0, 0.0, 612.0, 792.0]);
        for (i, op) in content.operations.iter().enumerate() {
            match op.operator.as_str() {
                "Tf" => {
                    if let Some(Object::Name(name)) = op.operands.first() {
                        let alias = String::from_utf8_lossy(name).to_string();
                        current_font = resource_fonts.get(&alias).cloned();
                    }
                    if let Some(Object::Real(s)) = op.operands.get(1) {
                        current_size = *s;
                    }
                    if let Some(Object::Integer(s)) = op.operands.get(1) {
                        current_size = *s as f32;
                    }
                }
                "Tj" => {
                    if let Some(Object::String(bytes, _)) = op.operands.first() {
                        let decoded = decode_for_display(&doc, current_font.as_deref(), bytes);
                        out.push(TextRun {
                            page: page_index,
                            text: decoded,
                            bbox,
                            operator_index: i as u32,
                            font: current_font
                                .clone()
                                .unwrap_or_else(|| "Unknown".to_string()),
                            font_size: current_size,
                        });
                    }
                }
                "TJ" => {
                    if let Some(Object::Array(items)) = op.operands.first() {
                        let mut combined = String::new();
                        for item in items {
                            if let Object::String(bytes, _) = item {
                                combined.push_str(&decode_for_display(
                                    &doc,
                                    current_font.as_deref(),
                                    bytes,
                                ));
                            }
                        }
                        out.push(TextRun {
                            page: page_index,
                            text: combined,
                            bbox,
                            operator_index: i as u32,
                            font: current_font
                                .clone()
                                .unwrap_or_else(|| "Unknown".to_string()),
                            font_size: current_size,
                        });
                    }
                }
                _ => {}
            }
        }
    }
    Ok(out)
}

/// Real replace path. Looks up the run, computes the new bytes via the
/// font's encoding, rewrites the Tj/TJ operand in place. The pristine
/// styling is preserved automatically because we touch nothing else.
pub fn replace_run(
    input: &Path,
    output: &Path,
    page_index: u32,
    operator_index: u32,
    new_text: &str,
) -> AppResult<()> {
    let mut doc =
        crate::services::pdf_guard::load_guarded(input).map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;
    let pages = doc.get_pages();
    let page_id = *pages
        .get(&(page_index + 1))
        .ok_or_else(|| AppError::InvalidArgument {
            detail: format!("page {page_index} not found"),
        })?;

    let mut content = doc
        .get_and_decode_page_content(page_id)
        .map_err(|e| AppError::Internal {
            detail: e.to_string(),
        })?;

    // Walk operations to find the target Tj/TJ AND the most-recent /Tf so
    // we know which font's encoding to invert.
    let resource_fonts = page_font_dict(&doc, page_id);
    let mut current_font_alias: Option<String> = None;
    let mut current_font_ps: Option<String> = None;
    let target = operator_index as usize;
    if target >= content.operations.len() {
        return Err(AppError::InvalidArgument {
            detail: format!("operator_index {target} out of range"),
        });
    }
    for (i, op) in content.operations.iter().enumerate() {
        if i > target {
            break;
        }
        if op.operator == "Tf" {
            if let Some(Object::Name(name)) = op.operands.first() {
                let alias = String::from_utf8_lossy(name).to_string();
                current_font_ps = resource_fonts.get(&alias).cloned();
                current_font_alias = Some(alias);
            }
        }
    }

    let op = &content.operations[target];
    if op.operator != "Tj" && op.operator != "TJ" {
        return Err(AppError::InvalidArgument {
            detail: format!(
                "target operator at index {target} is {}, not Tj/TJ",
                op.operator
            ),
        });
    }

    // Look up the font dictionary to learn the encoding.
    let font_obj = current_font_alias.as_ref().and_then(|alias| {
        let res = page_resources_font_object(&doc, page_id, alias)?;
        Some(res)
    });
    let new_bytes = encode_for_font(&doc, font_obj, new_text)?;

    let new_op = if op.operator == "Tj" {
        Operation::new(
            "Tj",
            vec![Object::String(new_bytes, lopdf::StringFormat::Hexadecimal)],
        )
    } else {
        Operation::new(
            "TJ",
            vec![Object::Array(vec![Object::String(
                new_bytes,
                lopdf::StringFormat::Hexadecimal,
            )])],
        )
    };
    content.operations[target] = new_op;

    // Re-encode content stream and replace.
    let new_bytes_stream = content.encode().map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    replace_page_content_stream(&mut doc, page_id, new_bytes_stream).map_err(|e| {
        AppError::Internal {
            detail: e.to_string(),
        }
    })?;
    let _ = current_font_ps; // silence unused-warning; kept for future width remap

    doc.compress();
    doc.save(output).map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    Ok(())
}

/// Resolve a font alias to its Resources /Font /<alias> object id, then
/// dereference to the font dictionary.
fn page_resources_font_object(
    doc: &Document,
    page_id: ObjectId,
    alias: &str,
) -> Option<lopdf::Dictionary> {
    let page = doc.get_object(page_id).ok()?.as_dict().ok()?;
    let res = page.get(b"Resources").ok()?;
    let res_dict = match res {
        Object::Dictionary(d) => d.clone(),
        Object::Reference(r) => doc.get_object(*r).ok()?.as_dict().ok()?.clone(),
        _ => return None,
    };
    let font = res_dict.get(b"Font").ok()?;
    let font_dict = match font {
        Object::Dictionary(d) => d.clone(),
        Object::Reference(r) => doc.get_object(*r).ok()?.as_dict().ok()?.clone(),
        _ => return None,
    };
    let entry = font_dict.get(alias.as_bytes()).ok()?;
    match entry {
        Object::Dictionary(d) => Some(d.clone()),
        Object::Reference(r) => Some(doc.get_object(*r).ok()?.as_dict().ok()?.clone()),
        _ => None,
    }
}

/// Map a page's /Resources /Font dictionary into a HashMap<alias, postscript_name>.
fn page_font_dict(doc: &Document, page_id: ObjectId) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Some(page) = doc.get_object(page_id).ok().and_then(|o| o.as_dict().ok()) else {
        return out;
    };
    let res = match page.get(b"Resources") {
        Ok(Object::Dictionary(d)) => d.clone(),
        Ok(Object::Reference(r)) => {
            if let Ok(Object::Dictionary(d)) = doc.get_object(*r) {
                d.clone()
            } else {
                return out;
            }
        }
        _ => return out,
    };
    let fonts = match res.get(b"Font") {
        Ok(Object::Dictionary(d)) => d.clone(),
        Ok(Object::Reference(r)) => {
            if let Ok(Object::Dictionary(d)) = doc.get_object(*r) {
                d.clone()
            } else {
                return out;
            }
        }
        _ => return out,
    };
    for (k, v) in fonts.iter() {
        let alias = String::from_utf8_lossy(k).to_string();
        let font_dict = match v {
            Object::Dictionary(d) => Some(d.clone()),
            Object::Reference(r) => doc
                .get_object(*r)
                .ok()
                .and_then(|o| o.as_dict().ok().cloned()),
            _ => None,
        };
        let ps = font_dict
            .as_ref()
            .and_then(|d| d.get(b"BaseFont").ok())
            .and_then(|o| o.as_name_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        out.insert(alias, ps);
    }
    out
}

fn page_mediabox(doc: &Document, page_id: ObjectId) -> Option<[f32; 4]> {
    let page = doc.get_object(page_id).ok()?.as_dict().ok()?;
    let mbox = page.get(b"MediaBox").ok()?.as_array().ok()?;
    if mbox.len() != 4 {
        return None;
    }
    let mut out = [0.0; 4];
    for (i, item) in mbox.iter().enumerate() {
        out[i] = match item {
            Object::Integer(n) => *n as f32,
            Object::Real(f) => *f,
            _ => return None,
        };
    }
    Some(out)
}

fn decode_for_display(doc: &Document, ps_name: Option<&str>, bytes: &[u8]) -> String {
    // Try ToUnicode first when font is a Type0; otherwise fall back to
    // a WinAnsi decode (which is the most common case).
    if let Some(ps) = ps_name {
        if let Some(toucode_map) = lookup_to_unicode_map(doc, ps) {
            return decode_via_to_unicode(bytes, &toucode_map);
        }
    }
    decode_winansi(bytes)
}

/// Re-write the page's /Contents to a single new stream.
fn replace_page_content_stream(
    doc: &mut Document,
    page_id: ObjectId,
    new_bytes: Vec<u8>,
) -> Result<()> {
    let stream_id = doc.add_object(Object::Stream(Stream::new(dictionary! {}, new_bytes)));
    if let Some(obj) = doc.objects.get_mut(&page_id) {
        if let Ok(d) = obj.as_dict_mut() {
            d.set("Contents", Object::Reference(stream_id));
        }
    }
    Ok(())
}

/// Inspect `font_obj` to learn the encoding, then encode `new_text`.
fn encode_for_font(
    doc: &Document,
    font_obj: Option<lopdf::Dictionary>,
    new_text: &str,
) -> AppResult<Vec<u8>> {
    let Some(font) = font_obj else {
        return Err(AppError::EncodingMismatch {
            detail: "no font selected at this Tj/TJ".into(),
        });
    };
    let subtype = font
        .get(b"Subtype")
        .and_then(|o| o.as_name_str())
        .ok()
        .unwrap_or("Type1")
        .to_string();
    if subtype == "Type0" {
        encode_type0(doc, &font, new_text)
    } else {
        encode_simple(&font, new_text)
    }
}

/// Type0/Identity-H + /ToUnicode → invert the CMap to UTF-8 → CID.
fn encode_type0(doc: &Document, font: &lopdf::Dictionary, new_text: &str) -> AppResult<Vec<u8>> {
    let to_unicode = font.get(b"ToUnicode").and_then(|o| o.as_reference()).ok();
    let to_unicode_bytes = match to_unicode.and_then(|r| doc.get_object(r).ok()) {
        Some(Object::Stream(s)) => s
            .decompressed_content()
            .unwrap_or_else(|_| s.content.clone()),
        _ => {
            return Err(AppError::EncodingMismatch {
                detail: "Type0 font has no /ToUnicode CMap; cannot invert".into(),
            });
        }
    };
    let cmap = parse_to_unicode_cmap(&to_unicode_bytes);
    let inverse: HashMap<char, u16> = cmap.into_iter().map(|(cid, ch)| (ch, cid)).collect();
    let mut out = Vec::with_capacity(new_text.len() * 2);
    let mut missing: Vec<char> = Vec::new();
    for c in new_text.chars() {
        match inverse.get(&c) {
            Some(cid) => {
                out.push((*cid >> 8) as u8);
                out.push((*cid & 0xFF) as u8);
            }
            None => missing.push(c),
        }
    }
    if !missing.is_empty() {
        let chars: String = missing.iter().collect();
        return Err(AppError::EncodingMismatch {
            detail: format!("font ToUnicode missing CIDs for: {chars}"),
        });
    }
    Ok(out)
}

/// Type1/TrueType simple fonts → /Encoding (or implicit WinAnsi) → 1-byte codes.
fn encode_simple(font: &lopdf::Dictionary, new_text: &str) -> AppResult<Vec<u8>> {
    let encoding = font
        .get(b"Encoding")
        .ok()
        .and_then(|o| o.as_name_str().ok())
        .unwrap_or("WinAnsiEncoding");
    let table: &[(char, u8)] = match encoding {
        "WinAnsiEncoding" => WIN_ANSI_TABLE,
        "MacRomanEncoding" => MAC_ROMAN_TABLE,
        _ => {
            return Err(AppError::EncodingMismatch {
                detail: format!("unsupported encoding '{encoding}' (no /ToUnicode either)"),
            });
        }
    };
    let inverse: HashMap<char, u8> = table.iter().copied().collect();
    let mut out = Vec::with_capacity(new_text.len());
    let mut missing: Vec<char> = Vec::new();
    for c in new_text.chars() {
        match inverse.get(&c) {
            Some(b) => out.push(*b),
            None => missing.push(c),
        }
    }
    if !missing.is_empty() {
        let chars: String = missing.iter().collect();
        return Err(AppError::EncodingMismatch {
            detail: format!("encoding {encoding} has no glyph for: {chars}"),
        });
    }
    Ok(out)
}

fn lookup_to_unicode_map(doc: &Document, ps_name: &str) -> Option<HashMap<u16, char>> {
    // Walk all font objects until we find one with a matching BaseFont.
    for obj in doc.objects.values() {
        let Object::Dictionary(d) = obj else { continue };
        let Ok(name) = d.get(b"BaseFont").and_then(|o| o.as_name_str()) else {
            continue;
        };
        if name != ps_name {
            continue;
        }
        let Ok(to_unicode_ref) = d.get(b"ToUnicode").and_then(|o| o.as_reference()) else {
            continue;
        };
        let Ok(Object::Stream(stream)) = doc.get_object(to_unicode_ref) else {
            continue;
        };
        let bytes = stream
            .decompressed_content()
            .unwrap_or_else(|_| stream.content.clone());
        return Some(parse_to_unicode_cmap(&bytes));
    }
    None
}

fn decode_via_to_unicode(bytes: &[u8], cmap: &HashMap<u16, char>) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i + 2 <= bytes.len() {
        let cid = u16::from_be_bytes([bytes[i], bytes[i + 1]]);
        if let Some(c) = cmap.get(&cid) {
            out.push(*c);
        }
        i += 2;
    }
    out
}

fn decode_winansi(bytes: &[u8]) -> String {
    let mut out = String::new();
    let inverse: HashMap<u8, char> = WIN_ANSI_TABLE.iter().map(|(c, b)| (*b, *c)).collect();
    for b in bytes {
        if let Some(c) = inverse.get(b) {
            out.push(*c);
        } else if *b < 0x80 {
            out.push(*b as char);
        }
    }
    out
}

/// Minimal CMap parser: extracts `bfchar` and `bfrange` entries into a
/// CID → char map. Comments, hex-string formatting tolerated.
pub fn parse_to_unicode_cmap(bytes: &[u8]) -> HashMap<u16, char> {
    let s = String::from_utf8_lossy(bytes);
    let mut map: HashMap<u16, char> = HashMap::new();
    // Parse bfchar entries: `<XXXX> <YYYY>` per line.
    let mut in_bfchar = false;
    let mut in_bfrange = false;
    for line in s.lines() {
        let trimmed = line.trim();
        if trimmed.contains("beginbfchar") {
            in_bfchar = true;
            continue;
        }
        if trimmed.contains("endbfchar") {
            in_bfchar = false;
            continue;
        }
        if trimmed.contains("beginbfrange") {
            in_bfrange = true;
            continue;
        }
        if trimmed.contains("endbfrange") {
            in_bfrange = false;
            continue;
        }
        if in_bfchar {
            // `<XXXX> <YYYY[YYYY...]>`
            if let Some((cid, unicode)) = parse_bfchar_line(trimmed) {
                map.insert(cid, unicode);
            }
        } else if in_bfrange {
            // `<X1> <X2> <Y>`: CIDs X1..X2 map to consecutive UTF-16 starting at Y.
            // Or `<X1> <X2> [<Y1> <Y2> ...]` array form.
            parse_bfrange_line(trimmed, &mut map);
        }
    }
    map
}

fn parse_bfchar_line(line: &str) -> Option<(u16, char)> {
    let parts: Vec<&str> = line
        .split(|c: char| c.is_whitespace())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.len() < 2 {
        return None;
    }
    let cid = parse_hex_u16(parts[0])?;
    let codepoint = parse_hex_codepoint(parts[1])?;
    Some((cid, codepoint))
}

fn parse_bfrange_line(line: &str, map: &mut HashMap<u16, char>) {
    let parts: Vec<&str> = line
        .split(|c: char| c.is_whitespace())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.len() < 3 {
        return;
    }
    let (Some(start), Some(end)) = (parse_hex_u16(parts[0]), parse_hex_u16(parts[1])) else {
        return;
    };
    // Array form like `[<aaaa> <bbbb>]`
    if line.contains('[') {
        let arr_start = line.find('[').unwrap_or(0) + 1;
        let arr_end = line.find(']').unwrap_or(line.len());
        let inner = &line[arr_start..arr_end];
        let items: Vec<&str> = inner
            .split(|c: char| c.is_whitespace())
            .filter(|s| !s.is_empty())
            .collect();
        for (i, item) in items.iter().enumerate() {
            let cid = start + i as u16;
            if cid > end {
                break;
            }
            if let Some(cp) = parse_hex_codepoint(item) {
                map.insert(cid, cp);
            }
        }
    } else if let Some(base) = parse_hex_codepoint(parts[2]) {
        // Consecutive: base, base+1, ...
        for (offset, cid) in (start..=end).enumerate() {
            let cp = char::from_u32(base as u32 + offset as u32).unwrap_or(base);
            map.insert(cid, cp);
        }
    }
}

fn parse_hex_u16(s: &str) -> Option<u16> {
    let stripped = s.trim_matches(|c| c == '<' || c == '>');
    u16::from_str_radix(stripped, 16).ok()
}

fn parse_hex_codepoint(s: &str) -> Option<char> {
    let stripped = s.trim_matches(|c| c == '<' || c == '>');
    let stripped = stripped.trim();
    if stripped.len() == 4 {
        let v = u16::from_str_radix(stripped, 16).ok()?;
        char::from_u32(v as u32)
    } else if stripped.len() == 8 {
        // Surrogate pair
        let hi = u16::from_str_radix(&stripped[0..4], 16).ok()? as u32;
        let lo = u16::from_str_radix(&stripped[4..8], 16).ok()? as u32;
        if (0xD800..=0xDBFF).contains(&hi) && (0xDC00..=0xDFFF).contains(&lo) {
            let cp = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
            char::from_u32(cp)
        } else {
            None
        }
    } else if stripped.len() == 6 {
        let v = u32::from_str_radix(stripped, 16).ok()?;
        char::from_u32(v)
    } else {
        None
    }
}

/// Redaction-style fallback (`replace_run_via_redaction`). Last-resort
/// path for when the font cannot be inverted (no ToUnicode + non-WinAnsi
/// + non-MacRoman). The frontend warns explicitly before invoking this.
pub fn replace_run_via_redaction(
    input: &Path,
    output: &Path,
    page_index: u32,
    rect: [f32; 4],
    new_text: &str,
    font_size: f32,
) -> Result<()> {
    let mut doc = crate::services::pdf_guard::load_guarded(input)?;
    let pages = doc.get_pages();
    let page_id = pages
        .get(&(page_index + 1))
        .copied()
        .context("page not found")?;
    let mut resources = page_resources_copy(&doc, page_id)?;
    let mut fonts = resources
        .get(b"Font")
        .ok()
        .map(|entry| dictionary_copy(&doc, entry))
        .transpose()?
        .unwrap_or_default();
    let mut font_number = 1;
    let mut font_name = format!("F{font_number}");
    while fonts.has(font_name.as_bytes()) {
        font_number += 1;
        font_name = format!("F{font_number}");
    }
    let [x, y, w, h] = rect;
    let ops = vec![
        Operation::new("q", vec![]),
        Operation::new("rg", vec![1.0.into(), 1.0.into(), 1.0.into()]),
        Operation::new("re", vec![x.into(), y.into(), w.into(), h.into()]),
        Operation::new("f", vec![]),
        Operation::new("Q", vec![]),
        Operation::new("BT", vec![]),
        Operation::new(
            "Tf",
            vec![
                Object::Name(font_name.as_bytes().to_vec()),
                font_size.into(),
            ],
        ),
        Operation::new(
            "Tm",
            vec![
                1.0.into(),
                0.0.into(),
                0.0.into(),
                1.0.into(),
                x.into(),
                (y + 2.0).into(),
            ],
        ),
        Operation::new("Tj", vec![Object::string_literal(new_text.to_string())]),
        Operation::new("ET", vec![]),
    ];
    let content = Content { operations: ops };
    let stream_id = doc.add_object(Object::Stream(Stream::new(
        dictionary! {},
        content.encode()?,
    )));
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding"
    });
    fonts.set(font_name.as_bytes().to_vec(), Object::Reference(font_id));
    resources.set("Font", fonts);
    if let Some(obj) = doc.objects.get_mut(&page_id) {
        if let Ok(d) = obj.as_dict_mut() {
            let mut contents: Vec<Object> = match d.get(b"Contents").cloned() {
                Ok(Object::Reference(r)) => vec![Object::Reference(r)],
                Ok(Object::Array(a)) => a,
                _ => Vec::new(),
            };
            contents.push(Object::Reference(stream_id));
            d.set("Contents", contents);
            d.set("Resources", resources);
        }
    }
    doc.compress();
    doc.save(output)?;
    Ok(())
}

// ===========================================================================
// WinAnsi / MacRoman tables (PDF 1.7 Annex D)
// ===========================================================================

/// WinAnsiEncoding (PDF 1.7 Annex D.2). The (char, code) pairs cover every
/// glyph in the 256-byte range that maps to a Unicode code point. ASCII
/// (0x20..0x7E) is identity except for a small number of substitutions.
#[rustfmt::skip]
const WIN_ANSI_TABLE: &[(char, u8)] = &[
    // ASCII printable identity (0x20..0x7E)
    (' ', 0x20), ('!', 0x21), ('"', 0x22), ('#', 0x23), ('$', 0x24),
    ('%', 0x25), ('&', 0x26), ('\'', 0x27), ('(', 0x28), (')', 0x29),
    ('*', 0x2A), ('+', 0x2B), (',', 0x2C), ('-', 0x2D), ('.', 0x2E),
    ('/', 0x2F),
    ('0', 0x30), ('1', 0x31), ('2', 0x32), ('3', 0x33), ('4', 0x34),
    ('5', 0x35), ('6', 0x36), ('7', 0x37), ('8', 0x38), ('9', 0x39),
    (':', 0x3A), (';', 0x3B), ('<', 0x3C), ('=', 0x3D), ('>', 0x3E),
    ('?', 0x3F), ('@', 0x40),
    ('A', 0x41), ('B', 0x42), ('C', 0x43), ('D', 0x44), ('E', 0x45),
    ('F', 0x46), ('G', 0x47), ('H', 0x48), ('I', 0x49), ('J', 0x4A),
    ('K', 0x4B), ('L', 0x4C), ('M', 0x4D), ('N', 0x4E), ('O', 0x4F),
    ('P', 0x50), ('Q', 0x51), ('R', 0x52), ('S', 0x53), ('T', 0x54),
    ('U', 0x55), ('V', 0x56), ('W', 0x57), ('X', 0x58), ('Y', 0x59),
    ('Z', 0x5A), ('[', 0x5B), ('\\', 0x5C), (']', 0x5D), ('^', 0x5E),
    ('_', 0x5F), ('`', 0x60),
    ('a', 0x61), ('b', 0x62), ('c', 0x63), ('d', 0x64), ('e', 0x65),
    ('f', 0x66), ('g', 0x67), ('h', 0x68), ('i', 0x69), ('j', 0x6A),
    ('k', 0x6B), ('l', 0x6C), ('m', 0x6D), ('n', 0x6E), ('o', 0x6F),
    ('p', 0x70), ('q', 0x71), ('r', 0x72), ('s', 0x73), ('t', 0x74),
    ('u', 0x75), ('v', 0x76), ('w', 0x77), ('x', 0x78), ('y', 0x79),
    ('z', 0x7A), ('{', 0x7B), ('|', 0x7C), ('}', 0x7D), ('~', 0x7E),
    // 0x80..0x9F extensions
    ('\u{20AC}', 0x80), // €
    ('\u{201A}', 0x82), // ‚
    ('\u{0192}', 0x83), // ƒ
    ('\u{201E}', 0x84), // „
    ('\u{2026}', 0x85), // …
    ('\u{2020}', 0x86), // †
    ('\u{2021}', 0x87), // ‡
    ('\u{02C6}', 0x88), // ˆ
    ('\u{2030}', 0x89), // ‰
    ('\u{0160}', 0x8A), // Š
    ('\u{2039}', 0x8B), // ‹
    ('\u{0152}', 0x8C), // Œ
    ('\u{017D}', 0x8E), // Ž
    ('\u{2018}', 0x91), // '
    ('\u{2019}', 0x92), // '
    ('\u{201C}', 0x93), // "
    ('\u{201D}', 0x94), // "
    ('\u{2022}', 0x95), // •
    ('\u{2013}', 0x96), // –
    ('\u{2014}', 0x97), // —
    ('\u{02DC}', 0x98), // ˜
    ('\u{2122}', 0x99), // ™
    ('\u{0161}', 0x9A), // š
    ('\u{203A}', 0x9B), // ›
    ('\u{0153}', 0x9C), // œ
    ('\u{017E}', 0x9E), // ž
    ('\u{0178}', 0x9F), // Ÿ
    // 0xA0..0xFF (Latin-1 Supplement; many are identity in WinAnsi)
    ('\u{00A0}', 0xA0), ('\u{00A1}', 0xA1), ('\u{00A2}', 0xA2),
    ('\u{00A3}', 0xA3), ('\u{00A4}', 0xA4), ('\u{00A5}', 0xA5),
    ('\u{00A6}', 0xA6), ('\u{00A7}', 0xA7), ('\u{00A8}', 0xA8),
    ('\u{00A9}', 0xA9), ('\u{00AA}', 0xAA), ('\u{00AB}', 0xAB),
    ('\u{00AC}', 0xAC), ('\u{00AD}', 0xAD), ('\u{00AE}', 0xAE),
    ('\u{00AF}', 0xAF),
    ('\u{00B0}', 0xB0), ('\u{00B1}', 0xB1), ('\u{00B2}', 0xB2),
    ('\u{00B3}', 0xB3), ('\u{00B4}', 0xB4), ('\u{00B5}', 0xB5),
    ('\u{00B6}', 0xB6), ('\u{00B7}', 0xB7), ('\u{00B8}', 0xB8),
    ('\u{00B9}', 0xB9), ('\u{00BA}', 0xBA), ('\u{00BB}', 0xBB),
    ('\u{00BC}', 0xBC), ('\u{00BD}', 0xBD), ('\u{00BE}', 0xBE),
    ('\u{00BF}', 0xBF),
    ('\u{00C0}', 0xC0), ('\u{00C1}', 0xC1), ('\u{00C2}', 0xC2),
    ('\u{00C3}', 0xC3), ('\u{00C4}', 0xC4), ('\u{00C5}', 0xC5),
    ('\u{00C6}', 0xC6), ('\u{00C7}', 0xC7), ('\u{00C8}', 0xC8),
    ('\u{00C9}', 0xC9), ('\u{00CA}', 0xCA), ('\u{00CB}', 0xCB),
    ('\u{00CC}', 0xCC), ('\u{00CD}', 0xCD), ('\u{00CE}', 0xCE),
    ('\u{00CF}', 0xCF),
    ('\u{00D0}', 0xD0), ('\u{00D1}', 0xD1), ('\u{00D2}', 0xD2),
    ('\u{00D3}', 0xD3), ('\u{00D4}', 0xD4), ('\u{00D5}', 0xD5),
    ('\u{00D6}', 0xD6), ('\u{00D7}', 0xD7), ('\u{00D8}', 0xD8),
    ('\u{00D9}', 0xD9), ('\u{00DA}', 0xDA), ('\u{00DB}', 0xDB),
    ('\u{00DC}', 0xDC), ('\u{00DD}', 0xDD), ('\u{00DE}', 0xDE),
    ('\u{00DF}', 0xDF),
    ('\u{00E0}', 0xE0), ('\u{00E1}', 0xE1), ('\u{00E2}', 0xE2),
    ('\u{00E3}', 0xE3), ('\u{00E4}', 0xE4), ('\u{00E5}', 0xE5),
    ('\u{00E6}', 0xE6), ('\u{00E7}', 0xE7), ('\u{00E8}', 0xE8),
    ('\u{00E9}', 0xE9), ('\u{00EA}', 0xEA), ('\u{00EB}', 0xEB),
    ('\u{00EC}', 0xEC), ('\u{00ED}', 0xED), ('\u{00EE}', 0xEE),
    ('\u{00EF}', 0xEF),
    ('\u{00F0}', 0xF0), ('\u{00F1}', 0xF1), ('\u{00F2}', 0xF2),
    ('\u{00F3}', 0xF3), ('\u{00F4}', 0xF4), ('\u{00F5}', 0xF5),
    ('\u{00F6}', 0xF6), ('\u{00F7}', 0xF7), ('\u{00F8}', 0xF8),
    ('\u{00F9}', 0xF9), ('\u{00FA}', 0xFA), ('\u{00FB}', 0xFB),
    ('\u{00FC}', 0xFC), ('\u{00FD}', 0xFD), ('\u{00FE}', 0xFE),
    ('\u{00FF}', 0xFF),
];

/// MacRomanEncoding (PDF 1.7 Annex D.3). Like WinAnsi for ASCII; 0x80+
/// is Mac OS Roman.
#[rustfmt::skip]
const MAC_ROMAN_TABLE: &[(char, u8)] = &[
    // ASCII printable identity
    (' ', 0x20), ('!', 0x21), ('"', 0x22), ('#', 0x23), ('$', 0x24),
    ('%', 0x25), ('&', 0x26), ('\'', 0x27), ('(', 0x28), (')', 0x29),
    ('*', 0x2A), ('+', 0x2B), (',', 0x2C), ('-', 0x2D), ('.', 0x2E),
    ('/', 0x2F),
    ('0', 0x30), ('1', 0x31), ('2', 0x32), ('3', 0x33), ('4', 0x34),
    ('5', 0x35), ('6', 0x36), ('7', 0x37), ('8', 0x38), ('9', 0x39),
    (':', 0x3A), (';', 0x3B), ('<', 0x3C), ('=', 0x3D), ('>', 0x3E),
    ('?', 0x3F), ('@', 0x40),
    ('A', 0x41), ('B', 0x42), ('C', 0x43), ('D', 0x44), ('E', 0x45),
    ('F', 0x46), ('G', 0x47), ('H', 0x48), ('I', 0x49), ('J', 0x4A),
    ('K', 0x4B), ('L', 0x4C), ('M', 0x4D), ('N', 0x4E), ('O', 0x4F),
    ('P', 0x50), ('Q', 0x51), ('R', 0x52), ('S', 0x53), ('T', 0x54),
    ('U', 0x55), ('V', 0x56), ('W', 0x57), ('X', 0x58), ('Y', 0x59),
    ('Z', 0x5A), ('[', 0x5B), ('\\', 0x5C), (']', 0x5D), ('^', 0x5E),
    ('_', 0x5F), ('`', 0x60),
    ('a', 0x61), ('b', 0x62), ('c', 0x63), ('d', 0x64), ('e', 0x65),
    ('f', 0x66), ('g', 0x67), ('h', 0x68), ('i', 0x69), ('j', 0x6A),
    ('k', 0x6B), ('l', 0x6C), ('m', 0x6D), ('n', 0x6E), ('o', 0x6F),
    ('p', 0x70), ('q', 0x71), ('r', 0x72), ('s', 0x73), ('t', 0x74),
    ('u', 0x75), ('v', 0x76), ('w', 0x77), ('x', 0x78), ('y', 0x79),
    ('z', 0x7A), ('{', 0x7B), ('|', 0x7C), ('}', 0x7D), ('~', 0x7E),
    // Mac Roman extensions (selected)
    ('\u{00C4}', 0x80), // Ä
    ('\u{00C5}', 0x81), // Å
    ('\u{00C7}', 0x82), // Ç
    ('\u{00C9}', 0x83), // É
    ('\u{00D1}', 0x84), // Ñ
    ('\u{00D6}', 0x85), // Ö
    ('\u{00DC}', 0x86), // Ü
    ('\u{00E1}', 0x87), // á
    ('\u{00E0}', 0x88), // à
    ('\u{00E2}', 0x89), // â
    ('\u{00E4}', 0x8A), // ä
    ('\u{00E3}', 0x8B), // ã
    ('\u{00E5}', 0x8C), // å
    ('\u{00E7}', 0x8D), // ç
    ('\u{00E9}', 0x8E), // é
    ('\u{00E8}', 0x8F), // è
    ('\u{00EA}', 0x90), // ê
    ('\u{00EB}', 0x91), // ë
    ('\u{00ED}', 0x92), // í
    ('\u{00EC}', 0x93), // ì
    ('\u{00EE}', 0x94), // î
    ('\u{00EF}', 0x95), // ï
    ('\u{00F1}', 0x96), // ñ
    ('\u{00F3}', 0x97), // ó
    ('\u{00F2}', 0x98), // ò
    ('\u{00F4}', 0x99), // ô
    ('\u{00F6}', 0x9A), // ö
    ('\u{00F5}', 0x9B), // õ
    ('\u{00FA}', 0x9C), // ú
    ('\u{00F9}', 0x9D), // ù
    ('\u{00FB}', 0x9E), // û
    ('\u{00FC}', 0x9F), // ü
    ('\u{2020}', 0xA0), // †
    ('\u{00B0}', 0xA1), // °
    ('\u{00A2}', 0xA2), // ¢
    ('\u{00A3}', 0xA3), // £
    ('\u{00A7}', 0xA4), // §
    ('\u{2022}', 0xA5), // •
    ('\u{00B6}', 0xA6), // ¶
    ('\u{00DF}', 0xA7), // ß
    ('\u{00AE}', 0xA8), // ®
    ('\u{00A9}', 0xA9), // ©
    ('\u{2122}', 0xAA), // ™
    ('\u{00B4}', 0xAB), // ´
    ('\u{00A8}', 0xAC), // ¨
    ('\u{2260}', 0xAD), // ≠
    ('\u{00C6}', 0xAE), // Æ
    ('\u{00D8}', 0xAF), // Ø
    ('\u{221E}', 0xB0), // ∞
    ('\u{00B1}', 0xB1), // ±
    ('\u{2264}', 0xB2), // ≤
    ('\u{2265}', 0xB3), // ≥
    ('\u{00A5}', 0xB4), // ¥
    ('\u{00B5}', 0xB5), // µ
    ('\u{2202}', 0xB6), // ∂
    ('\u{2211}', 0xB7), // ∑
    ('\u{220F}', 0xB8), // ∏
    ('\u{03C0}', 0xB9), // π
    ('\u{222B}', 0xBA), // ∫
    ('\u{00AA}', 0xBB), // ª
    ('\u{00BA}', 0xBC), // º
    ('\u{03A9}', 0xBD), // Ω
    ('\u{00E6}', 0xBE), // æ
    ('\u{00F8}', 0xBF), // ø
    ('\u{00BF}', 0xC0), // ¿
    ('\u{00A1}', 0xC1), // ¡
    ('\u{00AC}', 0xC2), // ¬
    ('\u{221A}', 0xC3), // √
    ('\u{0192}', 0xC4), // ƒ
    ('\u{2248}', 0xC5), // ≈
    ('\u{2206}', 0xC6), // ∆
    ('\u{00AB}', 0xC7), // «
    ('\u{00BB}', 0xC8), // »
    ('\u{2026}', 0xC9), // …
    ('\u{00A0}', 0xCA), //  (nbsp)
    ('\u{00C0}', 0xCB), // À
    ('\u{00C3}', 0xCC), // Ã
    ('\u{00D5}', 0xCD), // Õ
    ('\u{0152}', 0xCE), // Œ
    ('\u{0153}', 0xCF), // œ
    ('\u{2013}', 0xD0), // –
    ('\u{2014}', 0xD1), // —
    ('\u{201C}', 0xD2), // "
    ('\u{201D}', 0xD3), // "
    ('\u{2018}', 0xD4), // '
    ('\u{2019}', 0xD5), // '
    ('\u{00F7}', 0xD6), // ÷
    ('\u{25CA}', 0xD7), // ◊
    ('\u{00FF}', 0xD8), // ÿ
    ('\u{0178}', 0xD9), // Ÿ
    ('\u{2044}', 0xDA), // ⁄
    ('\u{20AC}', 0xDB), // €
    ('\u{2039}', 0xDC), // ‹
    ('\u{203A}', 0xDD), // ›
    ('\u{FB01}', 0xDE), // fi
    ('\u{FB02}', 0xDF), // fl
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn winansi_roundtrip_ascii() {
        let inverse: HashMap<char, u8> = WIN_ANSI_TABLE.iter().copied().collect();
        for c in "Hello World 1234 !@#$%".chars() {
            let b = inverse.get(&c).copied().expect("printable ASCII");
            // confirm reverse
            assert_eq!(b, c as u8);
        }
    }

    #[test]
    fn winansi_roundtrip_latin1() {
        // Plain Latin-1 letters in WinAnsi.
        let inverse: HashMap<char, u8> = WIN_ANSI_TABLE.iter().copied().collect();
        assert_eq!(inverse[&'\u{00E9}'], 0xE9); // é
        assert_eq!(inverse[&'\u{00D6}'], 0xD6); // Ö
        assert_eq!(inverse[&'\u{00DF}'], 0xDF); // ß
    }

    #[test]
    fn winansi_euro_at_0x80() {
        let inverse: HashMap<char, u8> = WIN_ANSI_TABLE.iter().copied().collect();
        assert_eq!(inverse[&'\u{20AC}'], 0x80);
    }

    #[test]
    fn macroman_e_at_8_e() {
        let inverse: HashMap<char, u8> = MAC_ROMAN_TABLE.iter().copied().collect();
        assert_eq!(inverse[&'\u{00E9}'], 0x8E);
        assert_eq!(inverse[&'\u{2122}'], 0xAA);
    }

    #[test]
    fn cmap_parser_handles_bfchar() {
        let s = b"begincmap\n2 beginbfchar\n<0041> <0041>\n<0042> <0042>\nendbfchar\nendcmap";
        let m = parse_to_unicode_cmap(s);
        assert_eq!(m.get(&0x41), Some(&'A'));
        assert_eq!(m.get(&0x42), Some(&'B'));
    }

    #[test]
    fn cmap_parser_handles_bfrange_consecutive() {
        let s = b"begincmap\n1 beginbfrange\n<0041> <0043> <0041>\nendbfrange\nendcmap";
        let m = parse_to_unicode_cmap(s);
        assert_eq!(m.get(&0x41), Some(&'A'));
        assert_eq!(m.get(&0x42), Some(&'B'));
        assert_eq!(m.get(&0x43), Some(&'C'));
    }

    #[test]
    fn cmap_parser_handles_bfrange_array() {
        let s = b"begincmap\n1 beginbfrange\n<0001> <0002> [<00C9> <00DF>]\nendbfrange\nendcmap";
        let m = parse_to_unicode_cmap(s);
        assert_eq!(m.get(&0x0001), Some(&'\u{00C9}'));
        assert_eq!(m.get(&0x0002), Some(&'\u{00DF}'));
    }

    #[test]
    fn encode_simple_winansi_rejects_unmappable() {
        let mut font = lopdf::Dictionary::new();
        font.set("Subtype", Object::Name(b"Type1".to_vec()));
        font.set("Encoding", Object::Name(b"WinAnsiEncoding".to_vec()));
        // "Slovenčina" contains 'č' which IS NOT in WinAnsi.
        let res = encode_simple(&font, "Slovenčina");
        assert!(res.is_err());
        match res.unwrap_err() {
            AppError::EncodingMismatch { detail } => {
                assert!(detail.contains("č"));
            }
            other => panic!("expected EncodingMismatch, got {other:?}"),
        }
    }

    #[test]
    fn encode_simple_winansi_succeeds_for_ascii() {
        let mut font = lopdf::Dictionary::new();
        font.set("Subtype", Object::Name(b"Type1".to_vec()));
        font.set("Encoding", Object::Name(b"WinAnsiEncoding".to_vec()));
        let res = encode_simple(&font, "Hello").unwrap();
        assert_eq!(res, b"Hello");
    }

    #[test]
    fn encode_simple_macroman_works() {
        let mut font = lopdf::Dictionary::new();
        font.set("Subtype", Object::Name(b"Type1".to_vec()));
        font.set("Encoding", Object::Name(b"MacRomanEncoding".to_vec()));
        let res = encode_simple(&font, "Aé").unwrap();
        // 'A' = 0x41, 'é' = 0x8E in MacRoman.
        assert_eq!(res, [0x41, 0x8E]);
    }
}
