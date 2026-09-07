// F3 (plan 066) / W3 (plan 067): renders real, OCR-recognizable Slovak
// diacritic text into a one-page, text-layer-free PDF - the `scanned.pdf`
// fixture the `sidecar-contract` job's OCR tests need. The old fixture was a
// 16x16 placeholder PNG with no glyphs, so Tesseract found nothing
// (`src-tauri/tests/ocr_edit_roundtrip_test.rs:92`).
//
// Runs under MuPDF's own JS engine via `mutool run` (NOT Node - the
// Font/Text/Pixmap/DrawDevice/PDFDocument globals below are mutool's, see
// https://mupdf.readthedocs.io/en/latest/reference/javascript/).
//
// Usage: mutool run generate-scanned-fixture.js <out.pdf>
//
// W3: the only input is the mutool sidecar itself. `new Font("Helvetica")`
// with no file path loads MuPDF's BUILT-IN base-14 face (URW Nimbus Sans),
// which carries every character this fixture needs - checked, not assumed:
// U+013D L-caron gid 285, U+0165 t-caron gid 566, U+010C C-caron gid 246,
// plus a i y with acutes. The first version of this script read
// `%WINDIR%\Fonts\arial.ttf`, which CI neither vendors nor stages: it
// happened to exist on `windows-latest`, but that image moves and nothing
// pinned it. mutool is pinned by sha256 in `scripts/sidecar-manifest.json`,
// so the built-in font is a checked dependency and the system font was not.
//
// Method: draw the text with Font.showString into a Pixmap at a 300dpi-
// equivalent pixel density for the page's physical size (so re-rendering it
// at 300dpi later, as the OCR pipeline does, is a ~1:1 resample instead of
// a blurry upscale), then embed that Pixmap as the sole content of a fresh
// one-page PDFDocument - an image-only page, exactly like a real scan.
//
// IMPORTANT: DrawDevice's ctm must flip the Y axis - `[1, 0, 0, -1, 0, H]`,
// not identity. PDF/MuPDF user space is Y-up (origin bottom-left) but a
// Pixmap's rows are stored top-down; skipping the flip renders the page
// upside down (confirmed empirically: Tesseract read a correctly-shaped
// but unflipped "TEST" render as "1E21" - each glyph's own rough
// point-symmetry made the corruption look like plausible OCR noise instead
// of an obviously mirrored image, until the flip fixed it outright).
var outPath = scriptArgs[0];
if (!outPath) {
    throw new Error("usage: mutool run generate-scanned-fixture.js <out.pdf>");
}
var slovakText = "Ľubomír Šťastný, Čadca";

var PAGE_W_PT = 900, PAGE_H_PT = 300;
var DPI = 300;
var SCALE = DPI / 72;
var PX_W = Math.round(PAGE_W_PT * SCALE);
var PX_H = Math.round(PAGE_H_PT * SCALE);

var font = new Font("Helvetica");
// Fail on the missing-glyph case rather than rendering a blank box that only
// shows up much later as an OCR mismatch. encodeCharacter returns glyph 0
// (.notdef) for a character the face cannot draw.
for (var i = 0; i < slovakText.length; i++) {
    var codePoint = slovakText.charCodeAt(i);
    if (font.encodeCharacter(codePoint) === 0) {
        throw new Error(
            "the built-in MuPDF font " + font.getName() + " has no glyph for U+" +
            codePoint.toString(16) + " (" + slovakText[i] + "); the fixture text and the " +
            "font no longer match, supply a font that covers Slovak instead"
        );
    }
}

var text = new Text();
var trm = [48 * SCALE, 0, 0, 48 * SCALE, 40 * SCALE, 190 * SCALE];
text.showString(font, trm, slovakText, 0);

var pm = new Pixmap(ColorSpace.DeviceGray, [0, 0, PX_W, PX_H], false);
pm.clear(255);
var dev = new DrawDevice([1, 0, 0, -1, 0, PX_H], pm);
dev.fillText(text, [1, 0, 0, 1, 0, 0], ColorSpace.DeviceGray, [0], 1);
dev.close();

var image = new Image(pm);
var doc = new PDFDocument();
var imageRef = doc.addImage(image);
var resources = { XObject: { Im0: imageRef } };
var contents = PAGE_W_PT + " 0 0 " + PAGE_H_PT + " 0 0 cm /Im0 Do";
var page = doc.addPage([0, 0, PAGE_W_PT, PAGE_H_PT], 0, resources, contents);
doc.insertPage(-1, page);
// Lossless: verified this does not change the rendered pixels or the OCR
// result; it just takes the fixture from ~4.7MB (raw pixmap) down to ~30KB.
doc.save(outPath, "compress-images,compress=flate");
print("[OK] scanned.pdf: " + slovakText + " (" + PX_W + "x" + PX_H + "px source, " + PAGE_W_PT + "x" + PAGE_H_PT + "pt page, font " + font.getName() + ")");
