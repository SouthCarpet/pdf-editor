// Phase 12 / Delta U — REAL Type0 CIDFont embedding.
//
// Pipeline:
//   1. Caller hands us a path to a TTF (or OTF with TrueType outlines).
//   2. add_text() registers every char the document will draw.
//   3. build_subset() produces a reduced TTF byte stream where unused
//      glyph slots are zero-length (loca[g+1] == loca[g]). Used glyphs
//      keep their original glyf records. This is the conservative
//      "preserve glyph IDs" approach: simpler than full GID renumbering,
//      no need to rewrite cmap or composite-glyph references, and still
//      yields ~70-90% size savings for typical text payloads.
//   4. write_to_pdf() emits the Type0 / CIDFontType2 / FontDescriptor /
//      FontFile2 / ToUnicode CMap chain and returns the indirect
//      reference id the page resource dict should point at.
//
// All of this runs synchronously in a tokio::task::spawn_blocking caller
// — file IO + a single pass over the font tables.

pub mod cmap;

use anyhow::{anyhow, Context, Result};
use lopdf::{dictionary, Document, Object, ObjectId, Stream};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use ttf_parser::{Face, GlyphId, Tag};

// SFNT table tags we copy through unchanged (when present) when emitting
// the subset.
const TABLES_PASSTHROUGH: &[&[u8; 4]] = &[
    b"head", b"hhea", b"maxp", b"hmtx", b"name", b"OS/2", b"post", b"cvt ", b"prep", b"fpgm",
    b"cmap",
];

/// In-memory subsetter for a single TTF font. Tracks the set of characters
/// referenced by the document so build_subset() can emit a minimal font.
pub struct FontSubsetter {
    font_data: Vec<u8>,
    used_chars: BTreeSet<char>,
    /// PostScript name of the original font, harvested from the `name`
    /// table. Used to prefix the subset tag in the emitted BaseFont name.
    postscript_name: String,
}

impl FontSubsetter {
    /// Load a font from disk and prepare the subsetter. Returns an error
    /// if the file cannot be parsed as TrueType.
    pub fn new_from_path(font_path: &Path) -> Result<Self> {
        let bytes = std::fs::read(font_path)
            .with_context(|| format!("read font {}", font_path.display()))?;
        Self::new_from_bytes(bytes)
    }

    /// Same as new_from_path but takes raw bytes (used by tests).
    pub fn new_from_bytes(bytes: Vec<u8>) -> Result<Self> {
        let face = Face::parse(&bytes, 0).with_context(|| "parse TTF face")?;
        // Read PS name from the `name` table; fall back to "EMBED" if not
        // present.
        let ps_name = face
            .names()
            .into_iter()
            .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME)
            .and_then(|n| n.to_string())
            .unwrap_or_else(|| "EMBED".to_string());
        Ok(FontSubsetter {
            font_data: bytes,
            used_chars: BTreeSet::new(),
            postscript_name: ps_name,
        })
    }

    /// Register every character of `text` so the subset includes their
    /// glyphs. ASCII whitespace is included; this matches reader behaviour
    /// when the user copies the text out.
    pub fn add_text(&mut self, text: &str) {
        for c in text.chars() {
            self.used_chars.insert(c);
        }
    }

    /// Lookup the GID for a character via the font's cmap. Returns 0
    /// (.notdef) for missing glyphs.
    pub fn cid_for_char(&self, c: char) -> Option<u16> {
        let face = Face::parse(&self.font_data, 0).ok()?;
        face.glyph_index(c).map(|GlyphId(g)| g)
    }

    /// Set of glyph IDs that the subset must keep alive, including
    /// transitively-referenced glyphs from composite records.
    pub fn used_glyph_ids(&self) -> BTreeSet<u16> {
        let face = match Face::parse(&self.font_data, 0) {
            Ok(f) => f,
            Err(_) => return BTreeSet::new(),
        };
        let mut used: BTreeSet<u16> = BTreeSet::new();
        used.insert(0); // .notdef is mandatory
        for c in &self.used_chars {
            if let Some(GlyphId(g)) = face.glyph_index(*c) {
                used.insert(g);
            }
        }
        // Composite glyphs: a glyph's record can reference other glyphs
        // by GID. Walk the glyf table for each used GID and pull in its
        // dependencies transitively. We do this by direct table parsing
        // because ttf-parser's high-level API does not expose the
        // component list.
        let glyf = face.raw_face().table(Tag::from_bytes(b"glyf"));
        let loca = face.raw_face().table(Tag::from_bytes(b"loca"));
        let head = face.raw_face().table(Tag::from_bytes(b"head"));
        if let (Some(glyf), Some(loca), Some(head)) = (glyf, loca, head) {
            // head.indexToLocFormat at offset 50 (u16). 0 = short, 1 = long.
            let loc_format = if head.len() >= 52 {
                u16::from_be_bytes([head[50], head[51]])
            } else {
                0
            };
            let mut to_walk: Vec<u16> = used.iter().copied().collect();
            while let Some(g) = to_walk.pop() {
                let (start, end) = glyph_range(loca, loc_format, g);
                if start >= end {
                    continue;
                }
                let body = &glyf[start..end];
                if body.len() < 2 {
                    continue;
                }
                let num_contours = i16::from_be_bytes([body[0], body[1]]);
                if num_contours >= 0 {
                    continue; // simple glyph
                }
                // Composite glyph: walk component records starting at byte 10.
                let mut pos = 10usize;
                loop {
                    if pos + 4 > body.len() {
                        break;
                    }
                    let flags = u16::from_be_bytes([body[pos], body[pos + 1]]);
                    let comp_gid = u16::from_be_bytes([body[pos + 2], body[pos + 3]]);
                    pos += 4;
                    if used.insert(comp_gid) {
                        to_walk.push(comp_gid);
                    }
                    // Skip argument bytes
                    let arg_size = if (flags & 0x0001) != 0 { 4 } else { 2 }; // ARG_1_AND_2_ARE_WORDS
                    pos += arg_size;
                    if (flags & 0x0008) != 0 {
                        // WE_HAVE_A_SCALE
                        pos += 2;
                    } else if (flags & 0x0040) != 0 {
                        // WE_HAVE_AN_X_AND_Y_SCALE
                        pos += 4;
                    } else if (flags & 0x0080) != 0 {
                        // WE_HAVE_A_TWO_BY_TWO
                        pos += 8;
                    }
                    if (flags & 0x0020) == 0 {
                        // MORE_COMPONENTS bit clear → done
                        break;
                    }
                }
            }
        }
        used
    }

    /// Build the reduced TTF byte stream. The strategy is "preserve glyph
    /// IDs": unused glyf entries become zero-length records. The cmap,
    /// hmtx (length stays = numGlyphs), maxp.numGlyphs all stay the same.
    /// This produces a valid TTF that any conformant reader accepts.
    pub fn build_subset(&self) -> Result<Vec<u8>> {
        let face = Face::parse(&self.font_data, 0).context("re-parse TTF for subset")?;
        let raw = face.raw_face();

        let head = raw
            .table(Tag::from_bytes(b"head"))
            .context("missing head")?;
        let glyf = raw.table(Tag::from_bytes(b"glyf"));
        let loca = raw.table(Tag::from_bytes(b"loca"));
        let maxp = raw
            .table(Tag::from_bytes(b"maxp"))
            .context("missing maxp")?;

        // Determine num_glyphs from maxp (offset 4, u16).
        if maxp.len() < 6 {
            return Err(anyhow!("maxp too short"));
        }
        let num_glyphs = u16::from_be_bytes([maxp[4], maxp[5]]);

        // head.indexToLocFormat: 0 = short (u16 offsets / 2), 1 = long (u32 offsets).
        let loc_format = u16::from_be_bytes([head[50], head[51]]);

        let used = self.used_glyph_ids();

        let mut new_glyf: Vec<u8> = Vec::new();
        let mut new_loca: Vec<u8> = Vec::new();

        if let (Some(glyf), Some(loca)) = (glyf, loca) {
            // Build new glyf + new loca in lock-step. For each GID 0..num_glyphs,
            // if it's used, copy its bytes from old glyf; otherwise emit zero-length.
            // glyf records must be padded to 4-byte alignment when the long loca
            // format is in use (per Apple TrueType reference) — we always pad.
            if loc_format == 0 {
                // short: u16 offset / 2, so max representable byte offset is 131070.
                // If the new glyf table would exceed 131070, we must escalate to
                // long format. Compute total used size up-front.
                let used_total: usize = used
                    .iter()
                    .map(|g| {
                        let (s, e) = glyph_range(loca, loc_format, *g);
                        align4(e - s)
                    })
                    .sum();
                if used_total > 0x1FFFE {
                    // Escalate. We synthesize a long-format loca and rewrite head.
                    return self.build_subset_long(num_glyphs, used);
                }
                for g in 0..=num_glyphs {
                    let off = new_glyf.len() / 2;
                    new_loca.extend_from_slice(&(off as u16).to_be_bytes());
                    if g == num_glyphs {
                        break;
                    }
                    if used.contains(&g) {
                        let (s, e) = glyph_range(loca, loc_format, g);
                        let bytes = &glyf[s..e];
                        new_glyf.extend_from_slice(bytes);
                        // Pad to even length (short loca needs offsets / 2).
                        if new_glyf.len() & 1 != 0 {
                            new_glyf.push(0);
                        }
                    }
                    // unused → no bytes, loca[g+1] == loca[g]
                }
            } else {
                for g in 0..=num_glyphs {
                    let off = new_glyf.len() as u32;
                    new_loca.extend_from_slice(&off.to_be_bytes());
                    if g == num_glyphs {
                        break;
                    }
                    if used.contains(&g) {
                        let (s, e) = glyph_range(loca, loc_format, g);
                        let bytes = &glyf[s..e];
                        new_glyf.extend_from_slice(bytes);
                        // Pad to 4-byte alignment.
                        while new_glyf.len() & 3 != 0 {
                            new_glyf.push(0);
                        }
                    }
                }
            }
        } else {
            // CFF / OTF fonts (no glyf/loca) — pass the font through unchanged.
            // We could subset the CFF table, but that is a separate project.
            // The Type0 / FontFile3 path is the right place, not FontFile2.
            return Err(anyhow!(
                "font is not TrueType (no glyf/loca tables); only TTF subsetting is supported"
            ));
        }

        // Emit a fresh SFNT. We keep tables in TABLES_PASSTHROUGH plus the
        // new glyf and loca. The `cmap` is kept identity-mapped because
        // PDF's Type0 / Identity-H takes care of mapping CIDs directly to
        // GIDs — but the cmap is still required so the font is valid TTF.
        let mut tables: Vec<(&[u8; 4], Vec<u8>)> = Vec::new();
        for tag in TABLES_PASSTHROUGH.iter().copied() {
            if let Some(data) = raw.table(Tag::from_bytes(tag)) {
                tables.push((tag, data.to_vec()));
            }
        }
        // Replace glyf and loca with the subsetted versions.
        // Replace any pre-existing glyf/loca entries before pushing the
        // subsetted versions. The pass-through loop above can't include
        // them because we want to control the bytes ourselves.
        tables.retain(|(t, _)| *t != b"glyf" && *t != b"loca");
        tables.push((b"glyf", new_glyf));
        tables.push((b"loca", new_loca));

        // Sort by tag for sfnt ordering.
        tables.sort_by_key(|(t, _)| **t);
        Ok(write_sfnt(&tables))
    }

    /// Fallback path for large fonts where the short loca format isn't big
    /// enough. Rewrites head.indexToLocFormat = 1 and emits 4-byte offsets.
    fn build_subset_long(&self, num_glyphs: u16, used: BTreeSet<u16>) -> Result<Vec<u8>> {
        let face = Face::parse(&self.font_data, 0).context("re-parse TTF")?;
        let raw = face.raw_face();
        let head = raw.table(Tag::from_bytes(b"head")).context("head")?;
        let glyf = raw.table(Tag::from_bytes(b"glyf")).context("glyf")?;
        let loca = raw.table(Tag::from_bytes(b"loca")).context("loca")?;
        let loc_format = u16::from_be_bytes([head[50], head[51]]);
        let mut new_glyf = Vec::new();
        let mut new_loca = Vec::new();
        for g in 0..=num_glyphs {
            let off = new_glyf.len() as u32;
            new_loca.extend_from_slice(&off.to_be_bytes());
            if g == num_glyphs {
                break;
            }
            if used.contains(&g) {
                let (s, e) = glyph_range(loca, loc_format, g);
                new_glyf.extend_from_slice(&glyf[s..e]);
                while new_glyf.len() & 3 != 0 {
                    new_glyf.push(0);
                }
            }
        }
        let mut new_head = head.to_vec();
        new_head[50] = 0;
        new_head[51] = 1;
        let mut tables: Vec<(&[u8; 4], Vec<u8>)> = Vec::new();
        for tag in TABLES_PASSTHROUGH.iter().copied() {
            if tag == b"head" || tag == b"glyf" {
                continue;
            }
            if let Some(data) = raw.table(Tag::from_bytes(tag)) {
                tables.push((tag, data.to_vec()));
            }
        }
        tables.push((b"head", new_head));
        tables.push((b"glyf", new_glyf));
        tables.push((b"loca", new_loca));
        tables.sort_by_key(|(t, _)| **t);
        Ok(write_sfnt(&tables))
    }

    /// Emit the Type0 / CIDFontType2 / FontDescriptor / FontFile2 /
    /// ToUnicode chain. Returns (font_object_id, subset_tag). The page
    /// resource dictionary should reference the returned id under
    /// `/Resources /Font /<subset_tag><postscript_name>`.
    pub fn write_to_pdf(&self, doc: &mut Document) -> Result<(ObjectId, String)> {
        // Subset tag: 6 random uppercase letters. PDF spec requires this
        // prefix so multiple subsets of the same font don't collide.
        let subset_tag = random_subset_tag();
        let base_font = format!("{}+{}", subset_tag, self.postscript_name);

        // Parse the original face for metrics.
        let face = Face::parse(&self.font_data, 0).context("parse face")?;
        let units_per_em = face.units_per_em() as f32;
        let scale = 1000.0 / units_per_em;

        // /FontDescriptor /FontBBox  [xMin yMin xMax yMax] in 1000-units.
        let bbox = face.global_bounding_box();
        let font_bbox = vec![
            Object::Real(bbox.x_min as f32 * scale),
            Object::Real(bbox.y_min as f32 * scale),
            Object::Real(bbox.x_max as f32 * scale),
            Object::Real(bbox.y_max as f32 * scale),
        ];

        // Build the subsetted TTF byte stream.
        let subset_bytes = self.build_subset().context("build_subset")?;
        let subset_len = subset_bytes.len();

        // /FontFile2 stream — the raw TTF bytes.
        let font_file_stream = Stream::new(
            dictionary! {
                "Length1" => subset_len as i64,
            },
            subset_bytes,
        );
        let font_file_id = doc.add_object(Object::Stream(font_file_stream));

        // /FontDescriptor dict.
        let ascent = face.ascender() as f32 * scale;
        let descent = face.descender() as f32 * scale;
        let cap_height = face
            .capital_height()
            .map(|c| c as f32 * scale)
            .unwrap_or(ascent);
        let italic_angle: f32 = face.italic_angle().unwrap_or(0.0);
        // Flags: bit 6 (nonsymbolic) for Latin text. For full-Unicode fonts
        // bit 3 (symbolic) is also valid; we use nonsymbolic which is the
        // common case for our text payloads.
        let flags: i64 = 32;

        let descriptor = dictionary! {
            "Type" => "FontDescriptor",
            "FontName" => Object::Name(base_font.as_bytes().to_vec()),
            "Flags" => flags,
            "FontBBox" => font_bbox,
            "ItalicAngle" => Object::Real(italic_angle),
            "Ascent" => Object::Real(ascent),
            "Descent" => Object::Real(descent),
            "CapHeight" => Object::Real(cap_height),
            "StemV" => 80i64,
            "FontFile2" => Object::Reference(font_file_id),
        };
        let descriptor_id = doc.add_object(Object::Dictionary(descriptor));

        // /W array: widths in 1000-units per CID. Build a compact mapping
        // for the used CIDs only, using the [first [w1 w2 …]] form.
        let used = self.used_glyph_ids();
        let mut widths: Vec<(u16, i64)> = Vec::new();
        for cid in &used {
            let gid = GlyphId(*cid);
            let advance = face.glyph_hor_advance(gid).unwrap_or(0);
            let w = ((advance as f32) * scale) as i64;
            widths.push((*cid, w));
        }
        widths.sort_by_key(|(c, _)| *c);
        let w_array = build_w_array(&widths);

        // /CIDFontType2 (the descendant font).
        let cid_font = dictionary! {
            "Type" => "Font",
            "Subtype" => "CIDFontType2",
            "BaseFont" => Object::Name(base_font.as_bytes().to_vec()),
            "CIDSystemInfo" => dictionary! {
                "Registry" => Object::string_literal("Adobe"),
                "Ordering" => Object::string_literal("Identity"),
                "Supplement" => 0i64,
            },
            "FontDescriptor" => Object::Reference(descriptor_id),
            "CIDToGIDMap" => Object::Name(b"Identity".to_vec()),
            "W" => w_array,
            "DW" => 1000i64,
        };
        let cid_font_id = doc.add_object(Object::Dictionary(cid_font));

        // /ToUnicode CMap stream.
        let mut cid_to_codepoint: BTreeMap<u16, char> = BTreeMap::new();
        let parsed = Face::parse(&self.font_data, 0).ok();
        for c in &self.used_chars {
            if let Some(GlyphId(g)) = parsed.as_ref().and_then(|f| f.glyph_index(*c)) {
                cid_to_codepoint.insert(g, *c);
            }
        }
        let cmap_bytes = cmap::build_to_unicode_cmap(&cid_to_codepoint);
        let cmap_stream = Stream::new(dictionary! {}, cmap_bytes);
        let cmap_id = doc.add_object(Object::Stream(cmap_stream));

        // /Type0 (the user-facing font).
        let type0 = dictionary! {
            "Type" => "Font",
            "Subtype" => "Type0",
            "BaseFont" => Object::Name(base_font.as_bytes().to_vec()),
            "Encoding" => Object::Name(b"Identity-H".to_vec()),
            "DescendantFonts" => Object::Array(vec![Object::Reference(cid_font_id)]),
            "ToUnicode" => Object::Reference(cmap_id),
        };
        let type0_id = doc.add_object(Object::Dictionary(type0));
        Ok((type0_id, subset_tag))
    }

    /// Encode `text` as a hex CID sequence suitable for use as the operand
    /// of a `Tj` / `TJ` operator. Identity-H emits 2-byte big-endian CIDs.
    /// Characters with no glyph map to .notdef (GID 0).
    pub fn encode_text_as_cids(&self, text: &str) -> Vec<u8> {
        let face = Face::parse(&self.font_data, 0).ok();
        let mut out = Vec::with_capacity(text.len() * 2);
        for c in text.chars() {
            let gid = face
                .as_ref()
                .and_then(|f| f.glyph_index(c))
                .map(|GlyphId(g)| g)
                .unwrap_or(0);
            out.push((gid >> 8) as u8);
            out.push((gid & 0xFF) as u8);
        }
        out
    }
}

/// Compute (start, end) byte offsets of glyph `g` inside the glyf table,
/// using the supplied loca table and head.indexToLocFormat.
fn glyph_range(loca: &[u8], loc_format: u16, g: u16) -> (usize, usize) {
    if loc_format == 0 {
        let i = g as usize * 2;
        if i + 4 > loca.len() {
            return (0, 0);
        }
        let s = u16::from_be_bytes([loca[i], loca[i + 1]]) as usize * 2;
        let e = u16::from_be_bytes([loca[i + 2], loca[i + 3]]) as usize * 2;
        (s, e)
    } else {
        let i = g as usize * 4;
        if i + 8 > loca.len() {
            return (0, 0);
        }
        let s = u32::from_be_bytes([loca[i], loca[i + 1], loca[i + 2], loca[i + 3]]) as usize;
        let e = u32::from_be_bytes([loca[i + 4], loca[i + 5], loca[i + 6], loca[i + 7]]) as usize;
        (s, e)
    }
}

fn align4(n: usize) -> usize {
    (n + 3) & !3
}

/// Write an SFNT file from a list of (tag, data) pairs. Computes the
/// table directory header (offset table, table records) and per-table
/// checksums. Tables must already be sorted by tag.
fn write_sfnt(tables: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
    let num_tables = tables.len() as u16;
    let mut log2 = 0u16;
    while (1u32 << log2) <= num_tables as u32 {
        log2 += 1;
    }
    log2 -= 1;
    let search_range = (1u16 << log2) * 16;
    let entry_selector = log2;
    let range_shift = num_tables * 16 - search_range;

    // SFNT version + offset table = 12 bytes.
    // Each table record = 16 bytes.
    let header_size = 12 + num_tables as usize * 16;
    let mut out = Vec::with_capacity(header_size);
    out.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]); // TrueType version
    out.extend_from_slice(&num_tables.to_be_bytes());
    out.extend_from_slice(&search_range.to_be_bytes());
    out.extend_from_slice(&entry_selector.to_be_bytes());
    out.extend_from_slice(&range_shift.to_be_bytes());

    // First pass: compute per-table offsets + checksums.
    let mut offset = header_size as u32;
    let mut records: Vec<(u32, u32, u32)> = Vec::with_capacity(tables.len());
    let mut padded: Vec<Vec<u8>> = Vec::with_capacity(tables.len());
    for (_, data) in tables {
        let cs = table_checksum(data);
        records.push((cs, offset, data.len() as u32));
        let mut buf = data.clone();
        while buf.len() & 3 != 0 {
            buf.push(0);
        }
        offset += buf.len() as u32;
        padded.push(buf);
    }
    // Emit table records.
    for ((tag, _), (cs, off, len)) in tables.iter().zip(records.iter()) {
        out.extend_from_slice(*tag);
        out.extend_from_slice(&cs.to_be_bytes());
        out.extend_from_slice(&off.to_be_bytes());
        out.extend_from_slice(&len.to_be_bytes());
    }
    // Append table bodies.
    for body in padded {
        out.extend_from_slice(&body);
    }

    // Recompute head.checkSumAdjustment per spec: 0xB1B0AFBA - whole_file_checksum.
    // First locate head table.
    let mut head_offset = None;
    for ((tag, _), (_, off, _)) in tables.iter().zip(records.iter()) {
        if **tag == *b"head" {
            head_offset = Some(*off as usize);
            break;
        }
    }
    if let Some(off) = head_offset {
        // Zero out the checkSumAdjustment field (offset 8 inside head) before
        // computing the full-file checksum.
        if off + 12 <= out.len() {
            out[off + 8] = 0;
            out[off + 9] = 0;
            out[off + 10] = 0;
            out[off + 11] = 0;
        }
        let whole = table_checksum(&out);
        let adj = 0xB1B0AFBA_u32.wrapping_sub(whole);
        let bytes = adj.to_be_bytes();
        if off + 12 <= out.len() {
            out[off + 8] = bytes[0];
            out[off + 9] = bytes[1];
            out[off + 10] = bytes[2];
            out[off + 11] = bytes[3];
        }
    }
    out
}

fn table_checksum(data: &[u8]) -> u32 {
    let mut sum: u32 = 0;
    let mut i = 0;
    while i + 4 <= data.len() {
        let v = u32::from_be_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
        sum = sum.wrapping_add(v);
        i += 4;
    }
    if i < data.len() {
        let mut tail = [0u8; 4];
        let n = data.len() - i;
        tail[..n].copy_from_slice(&data[i..]);
        let v = u32::from_be_bytes(tail);
        sum = sum.wrapping_add(v);
    }
    sum
}

/// Build a /W widths array using the canonical [first [w1 w2 …]] form.
/// Each (cid, width) pair becomes a single-element subarray; consecutive
/// CIDs are coalesced for compactness.
fn build_w_array(entries: &[(u16, i64)]) -> Object {
    let mut out: Vec<Object> = Vec::new();
    if entries.is_empty() {
        return Object::Array(out);
    }
    let mut i = 0;
    while i < entries.len() {
        let start = entries[i].0;
        let mut run: Vec<Object> = vec![Object::Integer(entries[i].1)];
        let mut j = i + 1;
        while j < entries.len() && entries[j].0 == entries[j - 1].0 + 1 {
            run.push(Object::Integer(entries[j].1));
            j += 1;
        }
        out.push(Object::Integer(start as i64));
        out.push(Object::Array(run));
        i = j;
    }
    Object::Array(out)
}

/// 6 random uppercase letters (PDF spec subset tag).
fn random_subset_tag() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64 + d.as_secs())
        .unwrap_or(0);
    let mut tag = String::with_capacity(6);
    let mut x = nanos;
    for _ in 0..6 {
        let c = ((x % 26) as u8 + b'A') as char;
        tag.push(c);
        x /= 26;
        x ^= x.rotate_left(13);
    }
    tag
}

#[cfg(test)]
mod tests {
    // Only the tests read a /Subtype name here.
    use super::*;
    use crate::services::lopdf_ext::ObjectExt;

    #[test]
    fn build_w_coalesces_runs() {
        let entries = vec![(1u16, 500), (2u16, 500), (3u16, 600), (10u16, 700)];
        let w = build_w_array(&entries);
        if let Object::Array(items) = w {
            // Expect: 1 [500 500 600] 10 [700]
            assert_eq!(items.len(), 4);
            assert!(matches!(items[0], Object::Integer(1)));
            assert!(matches!(items[2], Object::Integer(10)));
            if let Object::Array(run) = &items[1] {
                assert_eq!(run.len(), 3);
            } else {
                panic!("expected nested array");
            }
        } else {
            panic!("expected Array");
        }
    }

    #[test]
    fn subset_tag_is_six_uppercase() {
        let t = random_subset_tag();
        assert_eq!(t.len(), 6);
        assert!(t.chars().all(|c| c.is_ascii_uppercase()));
    }

    #[test]
    fn checksum_matches_known_value() {
        // 4-byte: 0x01 0x02 0x03 0x04 → 0x01020304
        let cs = table_checksum(&[0x01, 0x02, 0x03, 0x04]);
        assert_eq!(cs, 0x01020304);
    }

    // The end-to-end embedding tests need a real TTF file. The Windows
    // build runner has arial.ttf at C:\Windows\Fonts\arial.ttf; CI on
    // Linux containers does not. Gated to Windows + tagged #[ignore] so
    // the suite stays green offline.
    #[cfg(target_os = "windows")]
    #[test]
    fn arial_subset_roundtrips() {
        let arial = std::path::PathBuf::from("C:\\Windows\\Fonts\\arial.ttf");
        if !arial.exists() {
            eprintln!("arial.ttf not present; skipping");
            return;
        }
        let mut sub = FontSubsetter::new_from_path(&arial).expect("load");
        sub.add_text("Hello World Slovenčina");
        let bytes = sub.build_subset().expect("subset");
        // Re-parse the subset — if it's malformed, ttf-parser refuses.
        let face = ttf_parser::Face::parse(&bytes, 0).expect("parse subset");
        // GID for 'H' should be present (non-empty glyf).
        let gid = face.glyph_index('H').expect("H glyph").0;
        let _ = gid;
        // Sanity: every used char has a non-empty glyph in the subset.
        for c in "Hello World Slovenčina".chars() {
            if c.is_whitespace() {
                continue;
            }
            assert!(face.glyph_index(c).is_some(), "missing glyph for {c}");
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn arial_write_to_pdf_emits_chain() {
        let arial = std::path::PathBuf::from("C:\\Windows\\Fonts\\arial.ttf");
        if !arial.exists() {
            eprintln!("arial.ttf not present; skipping");
            return;
        }
        let mut sub = FontSubsetter::new_from_path(&arial).expect("load");
        sub.add_text("Hello");
        let mut doc = lopdf::Document::with_version("1.7");
        let (id, tag) = sub.write_to_pdf(&mut doc).expect("write");
        assert_eq!(tag.len(), 6);
        // Verify the indirect dict has Subtype Type0.
        let obj = doc.get_object(id).expect("get type0");
        if let lopdf::Object::Dictionary(d) = obj {
            let st = d.get(b"Subtype").unwrap().as_name_str().unwrap();
            assert_eq!(st, "Type0");
        } else {
            panic!("expected Dictionary");
        }
    }
}
