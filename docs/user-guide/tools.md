# Tools Reference

One-paragraph summary per tool. Detailed option semantics live in the per-tool option panels (open the tool, hover any control for its tooltip).

## Merge
Combines multiple PDFs into one. Order is the order you add files. Preserves all source pages without re-encoding.

## Split
Splits one PDF into N outputs by page ranges (`1-5, 6-10` produces two files) or by chunk size (every 10 pages).

## Extract pages
Produces a new PDF containing only the page numbers you list. Same parser as Split's range field.

## Organize
Reorder, rotate (90/180/270 degrees), delete, and insert blank pages in any combination. Operates on a single PDF.

## Compress
Reduces file size via Ghostscript presets (Screen / Recommended / Print) or a Custom preset that exposes DPI + color mode + downsampling explicitly.

## Optimize
Modular pipeline: deduplicate, subset fonts, strip unused objects, recompress images, garbage-collect. Each step is opt-in with sensible defaults.

## Edit
Four sub-tools, all in the Workspace:
- **Forms**: fill out / flatten AcroForm fields. Typed AcroForm values stay when you switch to another sub-tool and back. The first **Save filled copy** asks for a path. A later save writes over that saved copy without asking, starts from it, and sends every value that differs from it. After a save the workspace shows the saved copy with its values. A value you change while a save is still writing stays unsaved, and the next save writes it.
  - A scanned form has no AcroForm fields. **Find fields** detects the empty cells and lines of the page: one field per visible table cell. A cell whose printed label leaves no room to write (for example "Name:" or a column header) is not a field. A cell with a label and a wide empty part stays a field.
  - A document can mix native form fields and printed boxes (a scan appended to a form). **Find fields** is then offered below the native field list and works on the page in view. A detected box is left out when native form widgets cover at least half of it, so one cell never gets two fields. A small widget inside a large cell, such as a checkbox in a corner, does not hide the cell. Once boxes are found, the button under them is named **Save form values and detected fields** and writes both kinds of value.
  - Values you type stay on the page in every tool and sub-tool until you save them. This holds on the page in view and, in book mode, on the facing page of the spread. The page thumbnails do not show unsaved values. A typed AcroForm value shows at its form field on the page; a radio group shows its choice in the panel only.
  - Typed AcroForm values are unsaved work. The close dialog asks before they are lost. **Save** in that dialog, or the toolbar Save, writes them (together with the detected-field values, form values first). **Discard** drops them. Autosave keeps them for crash recovery.
  - A click on a filled cell edits its value. A cell never gets a second value: a click on a cell with a saved value opens that value for editing, and the next save replaces the saved value instead of adding one on top. A value you change while a save is still writing stays unsaved, and the next save writes it.
  - Delete the text of a saved value and save: the saved value is deleted and the cell reads as unfilled when you open the file again. A new fill with no text is not written.
  - A value longer than its cell is clipped at the cell edge, on the page and in the saved file. It never covers the neighbouring cells. Make the font smaller or the value box wider to show all of it.
  - A value dragged partly off the page moves back onto the page and keeps its size. A value resized past the page edge is cut at the edge, on any of the four sides and on a rotated page.
  - **Save filled copy** (detected fields) writes each value as a FreeText annotation with an appearance stream (`/AP`). The values are not flattened and are not AcroForm values; any PDF reader shows them. After a save the workspace shows the saved copy, and cells that hold a saved value show as filled. A later save starts from that saved copy, so all values stay. The saved copy is replaced only after the new file is written completely.
- **Annotations**: text notes, highlights, shapes, free-draw.
- **Text**: real inline text editing of existing content. Replaces text with proper Type0 CIDFont embedding (preserves Slovak/Czech/German/etc. diacritics with no Standard-14 fallback).
- **Signature**: draw a signature, upload a PNG, or select a saved signature or stamp. Deleting a saved signature opens a dialog with its name. Select **Delete** to remove it or **Cancel** to keep it.

The page sits on a flat sheet above the canvas. The tool bar and side panels
use quieter controls. Select a page thumbnail to carry its image into the
page view. The carry takes about 200 ms after the page renders. With reduced
motion, or when view transitions are unavailable, the page changes without
animation. Thumbnails keep visible keyboard focus.

### Draw your own form fields

In **Edit -> Forms**, select **Text field** or **Checkbox**. Click the page
to place a default box (text: 140 x 22 pt; checkbox: 14 x 14 pt), or drag
to draw one. A drawn box is at least 12 x 12 pt. Checkboxes stay square.
The box stays inside the page. Placement ends after one field. Press Escape
to cancel placement.

Click a pending box or its name in the **Own fields** list to select it.
The list can also take you to a field on another page. For a new field, change its name and,
for text, **Multiline** and **Font size** (0 means automatic). Drag the box
to move it, or drag an edge handle to resize it. Arrow keys move it 1 pt;
Shift+arrow moves it 10 pt. Tab to an edge handle to resize with arrow keys
(1 pt, or 10 pt with Shift). The focused handle has a visible outline.
Delete removes the selected box when focus is
outside a text input. **Delete field** also removes it. Ctrl+Z and Ctrl+Y
undo and redo creation, edits, moves, resizes and deletion.

On save, dots in a name become underscores. Control characters and outer
spaces are removed. The name is cut to 128 characters, then a suffix such
as `_2` is added if needed to make it unique. An empty name becomes `Field`.

Use the toolbar **Save** or Ctrl+S to write real AcroForm fields. The close
guard and autosave include pending fields. A pending box stays visible in
other tools and on the facing page of a book spread as a read-only preview.
After saving, it leaves the pending
layer and appears in the native Forms list. Fill its value there, or open
the saved PDF in another form reader. Pending fields do not accept values.

To change a saved own field, select **Edit layout: [field name]** in the
**Own fields** section. It becomes a pending box. Move or resize it with
the same controls, or select **Delete field**. Ctrl+Z and Ctrl+Y undo and
redo these changes, including the selection. Save replaces or removes the
saved field. Source fields and older own fields without the ownership
marker have no layout action. Their values remain available in Forms.
Layout edits keep the saved field's name, filled value and text settings.
The name, multiline and font-size controls apply to new pending fields.
Pending own fields and saved fields opened for layout editing use the same
tinted preview with readable labels in light and dark themes. Typed form
values also use a tinted preview until saved. These preview colours do not
change the PDF content.

## Crop
Set page-box rectangles manually, lock to a preset paper size, or auto-detect content margins. Supports per-page or apply-to-all.

## Compare
Side-by-side visual diff + text-level diff. Reports per-page divergence ratio and highlights changes inline.

## Unlock
Removes the user/owner password from a PDF you have rights to open. Type A (owner-only permission lock) is automatic; Type B (user open password) accepts the password you type. Secondary Recovery mode runs Dictionary or Brute force attacks via pdfcrack.

## Convert PDF -> ...
Tier A (text): TXT, HTML. Tier B (office): DOCX, ODT, RTF, ePub. Tier B (raster): JPG, PNG, TIFF (DPI configurable). PDF/A export defaults to PDF/A-2 via LibreOffice with Ghostscript fallback.

## Convert ... -> PDF
Images (JPG/PNG/TIFF/BMP), office (DOCX/ODT/XLSX/PPTX/RTF/ePub), HTML. Multi-page output preserves source pagination.

## OCR
Tesseract 5 sidecar. Bundled languages: English, Slovak, Czech, German. Output modes: Searchable PDF (text layer overlay), Text-only PDF, plaintext. Deskew + despeckle pre-processing optional. Slovak diacritics preserved through Type0 CIDFont injection.

## Pipeline
Chain any subset of the above tools into a DAG via the xyflow node editor. Save presets. Run on a single file, a list, or every PDF in a folder.

## Projects
Group related PDFs + saved pipelines. "Run all" iterates each pipeline against the project's files. Export/import as `.pdf-project` for sharing.
