// Build a ToUnicode CMap (PostScript CMap) mapping CIDs back to UTF-16 code
// points. The returned bytes are the uncompressed content stream — lopdf
// applies FlateDecode on save. Format per PDF 1.7 § 9.10 "Extraction of
// Text Content" using `bfchar` + `bfrange` operators (we emit `bfchar`
// only; ranges are an optimization the v1 path skips).

use std::collections::BTreeMap;

/// Emit a ToUnicode CMap that the PDF reader can use to reverse-map CIDs
/// back to Unicode code points for copy-paste / accessibility. Chunks
/// `bfchar` entries into groups of 100 per the PDF reference's stated
/// upper bound.
pub fn build_to_unicode_cmap(cid_to_codepoint: &BTreeMap<u16, char>) -> Vec<u8> {
    let mut out = String::new();
    out.push_str("/CIDInit /ProcSet findresource begin\n");
    out.push_str("12 dict begin\nbegincmap\n");
    out.push_str("/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n");
    out.push_str("/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n");
    out.push_str("1 begincodespacerange <0000> <FFFF> endcodespacerange\n");
    let entries: Vec<_> = cid_to_codepoint.iter().collect();
    for chunk in entries.chunks(100) {
        out.push_str(&format!("{} beginbfchar\n", chunk.len()));
        for (cid, ch) in chunk {
            let code = **ch as u32;
            if code <= 0xFFFF {
                out.push_str(&format!("<{:04X}> <{:04X}>\n", cid, code));
            } else {
                // Surrogate pair for code points above the BMP.
                let c = code - 0x10000;
                let hi = 0xD800 + (c >> 10);
                let lo = 0xDC00 + (c & 0x3FF);
                out.push_str(&format!("<{:04X}> <{:04X}{:04X}>\n", cid, hi, lo));
            }
        }
        out.push_str("endbfchar\n");
    }
    out.push_str("endcmap CMapName currentdict /CMap defineresource pop end end\n");
    out.into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cmap_emits_expected_header() {
        let mut m = BTreeMap::new();
        m.insert(1u16, 'A');
        m.insert(2u16, 'B');
        let bytes = build_to_unicode_cmap(&m);
        let s = String::from_utf8(bytes).unwrap();
        assert!(s.contains("/CIDSystemInfo"));
        assert!(s.contains("2 beginbfchar"));
        assert!(s.contains("<0001> <0041>"));
        assert!(s.contains("<0002> <0042>"));
        assert!(s.contains("endbfchar"));
    }

    #[test]
    fn cmap_chunks_at_100() {
        let mut m = BTreeMap::new();
        for i in 1u16..=250u16 {
            m.insert(i, char::from_u32(0x4E00 + i as u32).unwrap());
        }
        let bytes = build_to_unicode_cmap(&m);
        let s = String::from_utf8(bytes).unwrap();
        // 250 entries → chunks of 100, 100, 50.
        let beginbfchar_count = s.matches("beginbfchar").count();
        assert_eq!(beginbfchar_count, 3);
    }
}
