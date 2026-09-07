// W6 (plan 067): builds `slovak-utf8.pdf`, the fixture behind the UTF-8
// round-trip suite (`src-tauri/tests/utf8_roundtrip_test.rs`) and
// `text_extractor_test::extract_text_from_slovak_pdf_preserves_diacritics`.
//
// It used to come from LibreOffice, which CI never stages, so those seven
// tests failed in the `sidecar-contract` job every run. Worse, the HTML that
// step wrote had already lost its diacritics ("Priliz zltucky kon ..."), so
// even a machine WITH LibreOffice produced a fixture that could not satisfy
// `EXPECTED_GRAPHEMES`.
//
// Runs under MuPDF's own JS engine via `mutool run` (NOT Node - PDFDocument,
// Font and the rest are mutool's globals, see
// https://mupdf.readthedocs.io/en/latest/reference/javascript/).
//
// Usage: mutool run generate-slovak-fixture.js <out.pdf>
//
// Dependencies: the mutool sidecar and nothing else. `new Font("Helvetica")`
// loads MuPDF's built-in base-14 face (URW Nimbus Sans), and
// `PDFDocument.addFont` embeds it as a Type0 / Identity-H / CIDFontType0 with
// a /ToUnicode CMap - which is what makes the text extractable again after
// Ghostscript compression and after `mutool clean -gggg -S`. mutool is pinned
// by sha256 in `scripts/sidecar-manifest.json`; a system font would not be.
//
// The text is deliberately large (30 pt on a 1000x300 pt page): the OCR test
// `ocr_recovers_diacritics_from_scanned_slovak` re-renders this page at 300 dpi
// and reads it with Tesseract, which needs real glyph height to recognize
// diacritics - the same reason `generate-scanned-fixture.js` renders at 300 dpi.
var outPath = scriptArgs[0];
if (!outPath) {
    throw new Error("usage: mutool run generate-slovak-fixture.js <out.pdf>");
}

// Four pangram-style lines. Between them they carry every grapheme in
// `EXPECTED_GRAPHEMES` (utf8_roundtrip_test.rs): Slovak, Czech-only, German.
// The last line exists for 'ĺ', which no common pangram contains.
var LINES = [
    "Kŕdeľ ďatľov učí koňa žrať kôru.",
    "Příliš žluťoučký kůň úpěl ďábelské ódy.",
    "Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.",
    "V hĺbke pri stĺpe zavýja vĺča."
];
// Kept in the same order as EXPECTED_GRAPHEMES so the two lists can be diffed
// by eye when either changes.
var REQUIRED_GRAPHEMES = "áčďéíľĺňóôŕšťúýžěřůäöüß";

var PAGE_W_PT = 1000, PAGE_H_PT = 300;
var FONT_SIZE = 30, MARGIN_PT = 40;
var BASELINES = [240, 180, 120, 60];

var font = new Font("Helvetica");

// Fail at generation instead of leaving a fixture that quietly misses a
// grapheme and surfaces much later as an unexplained assertion failure.
var joined = LINES.join(" ");
for (var r = 0; r < REQUIRED_GRAPHEMES.length; r++) {
    if (joined.indexOf(REQUIRED_GRAPHEMES[r]) < 0) {
        throw new Error(
            "the fixture text no longer contains U+" +
            REQUIRED_GRAPHEMES.charCodeAt(r).toString(16) + " (" + REQUIRED_GRAPHEMES[r] +
            "), which utf8_roundtrip_test.rs EXPECTED_GRAPHEMES requires"
        );
    }
}

// Identity-H means the string is written as 2-byte glyph ids, so every
// character has to resolve to a real glyph. encodeCharacter returns 0
// (.notdef) when the face cannot draw it.
function encodeIdentityH(line) {
    var hex = "";
    for (var i = 0; i < line.length; i++) {
        var codePoint = line.charCodeAt(i);
        var glyph = font.encodeCharacter(codePoint);
        if (glyph === 0) {
            throw new Error(
                "the built-in MuPDF font " + font.getName() + " has no glyph for U+" +
                codePoint.toString(16) + " (" + line[i] + "); supply a font that covers " +
                "Slovak, Czech and German instead"
            );
        }
        hex += ("0000" + glyph.toString(16)).slice(-4);
    }
    return hex;
}

function widthPt(line) {
    var em = 0;
    for (var i = 0; i < line.length; i++) {
        em += font.advanceGlyph(font.encodeCharacter(line.charCodeAt(i)), 0);
    }
    return em * FONT_SIZE;
}

var doc = new PDFDocument();
// addFont embeds the face as a CID font (Type0 / Identity-H) WITH a ToUnicode
// CMap; addSimpleFont would give a single-byte encoding that cannot carry
// Latin Extended-A at all.
var fontResource = doc.newDictionary();
fontResource.put("F0", doc.addFont(font));
var resources = doc.newDictionary();
resources.put("Font", fontResource);

var contents = "";
for (var l = 0; l < LINES.length; l++) {
    var width = widthPt(LINES[l]);
    if (MARGIN_PT + width > PAGE_W_PT - MARGIN_PT) {
        throw new Error(
            "line " + (l + 1) + " needs " + Math.round(width) + " pt but the page is only " +
            PAGE_W_PT + " pt wide; widen the page or shorten the line"
        );
    }
    contents += "BT /F0 " + FONT_SIZE + " Tf 1 0 0 1 " + MARGIN_PT + " " + BASELINES[l] +
        " Tm <" + encodeIdentityH(LINES[l]) + "> Tj ET\n";
}

var page = doc.addPage([0, 0, PAGE_W_PT, PAGE_H_PT], 0, resources, contents);
doc.insertPage(-1, page);
doc.save(outPath, "compress");
print("[OK] slovak-utf8.pdf: " + LINES.length + " lines, " + FONT_SIZE + "pt on " +
    PAGE_W_PT + "x" + PAGE_H_PT + "pt, font " + font.getName());
