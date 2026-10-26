// Synthetic, image-only regression fixture. No external fonts or source scan.
// Run with the pinned MuPDF sidecar:
// mutool run scripts/generate-timesheet-fixture.js src-tauri/tests/fixtures/pdfs/timesheet-scan.pdf
var outPath = scriptArgs[0];
if (!outPath) throw new Error("usage: mutool run generate-timesheet-fixture.js <out.pdf>");
var width = 595.44, height = 841.91519, scale = 3;
var pixels = new Pixmap(ColorSpace.DeviceGray, [0, 0, Math.ceil(width * scale), Math.ceil(height * scale)], false);
pixels.clear(255);
var device = new DrawDevice([scale, 0, 0, -scale, 0, height * scale], pixels);
var font = new Font("Helvetica");
function label(value, x, y, size) {
    var text = new Text();
    text.showString(font, [size, 0, 0, size, x, y], value, 0);
    device.fillText(text, [1, 0, 0, 1, 0, 0], ColorSpace.DeviceGray, [0], 1);
}
function line(x0, y0, x1, y1) {
    var path = new Path();
    path.moveTo(x0, y0);
    path.lineTo(x1, y1);
    device.strokePath(path, new StrokeState({lineWidth: 0.8}), [1, 0, 0, 1, 0, 0], ColorSpace.DeviceGray, [0], 1);
}
label("Weekly timesheet", 53, 740, 20);
label("Synthetic test fixture", 53, 715, 11);
var columns = [53, 94, 154, 214, 274, 344, 524];
var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
for (var col = 0; col < columns.length; col++) line(columns[col], 504, columns[col], 664);
for (var row = 0; row <= 8; row++) line(53, 664 - row * 20, 524, 664 - row * 20);
var headers = ["Day", "Start time", "Finish time", "Break time", "Total hours", "Notes: use blank cells below for comments"];
for (var h = 0; h < headers.length; h++) label(headers[h], columns[h] + 4, 651, 8);
for (var d = 0; d < days.length; d++) label(days[d], 57, 631 - d * 20, 9);
line(53, 160, 344, 160);
line(53, 180, 344, 180);
line(53, 160, 53, 180);
line(344, 160, 344, 180);
label("Sign:", 57, 167, 9);
device.close();
// Threshold the rendered glyphs and rules to a genuine 1-bit scan.
function monochromeRow(y) {
    var row = new Buffer();
    for (var x = 0; x < pixels.getWidth(); x += 8) {
        var byte = 0;
        for (var bit = 0; bit < 8; bit++) {
            if (x + bit < pixels.getWidth() && pixels.getSample(x + bit, y, 0) >= 128) {
                byte |= 1 << (7 - bit);
            }
        }
        row.writeByte(byte);
    }
    return row;
}
var bitmap = new Buffer();
for (var y = 0; y < pixels.getHeight(); y++) bitmap.writeBuffer(monochromeRow(y));
var document = new PDFDocument();
var image = document.addStream(bitmap, {
    Type: "XObject", Subtype: "Image", Width: pixels.getWidth(), Height: pixels.getHeight(),
    ColorSpace: "DeviceGray", BitsPerComponent: 1
});
var page = document.addPage([0, 0, width, height], 0, {}, width + " 0 0 " + height + " 0 0 cm /Im0 Do");
// Keep /Resources inside the page dictionary, as real scanners write it. The
// save-with-values path edits that dictionary in place.
var xobjects = document.newDictionary();
xobjects.put("Im0", image);
var resources = document.newDictionary();
resources.put("XObject", xobjects);
page.put("Resources", resources);
document.insertPage(-1, page);
document.save(outPath, "compress-images,compress=flate");
print("[OK] timesheet-scan.pdf: one image-only page, neutral seven-day grid");


