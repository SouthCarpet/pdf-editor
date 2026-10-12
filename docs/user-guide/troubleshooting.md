# Troubleshooting

## "Sidecar failed: timeout"
The bundled sidecar (qpdf / Ghostscript / MuPDF / Tesseract / pdfcrack) exceeded its 120 s budget. Usually a very large or corrupted PDF. Try splitting the input first, or run Optimize before the failing tool.

## OCR loses diacritics
Make sure the OCR language matches the document language. Slovak, Czech, and German tessdata files are bundled. For other languages, drop the `.traineddata` file into Settings -> OCR -> Languages, then re-run.

## "Password required"
The PDF has a user-open password (Type B). Type it in the Unlock tool. For permission-locked (Type A) PDFs the Unlock tool removes the lock without a password. For unknown passwords, switch to Recovery and pick Dictionary or Brute mode.

## Compare reports false positives
Whitespace-only diffs can appear when fonts re-render slightly differently between source and target. Increase the diff threshold in the Compare panel.

## Convert to DOCX fails
The LibreOffice tree may be missing or stale. Reinstall via the MSI. The tree is shipped at `%ProgramFiles%\PDF Editor\resources\libreoffice\` (or per-user equivalent).

## App crashes silently on launch
Check `%AppData%\PDF Editor\logs\` for the rotated tracing logs and the SEH crash log. Most launch crashes are missing Microsoft Visual C++ Redistributable; reinstall it from the Microsoft download site.

## Pipeline runs hang
A node may be waiting on a sidecar. Open Settings -> Diagnostics to see active sidecar PIDs. Cancel from the Pipeline run dialog; cancellation propagates to the running sidecars (kill_on_drop).

## Recent files don't appear
The SQLite database lives at `%AppData%\PDF Editor\state.db`. If it gets corrupted, delete the file and restart, the app will recreate it (you'll lose recent files but no PDF content).

## Find fields marks a label cell, or misses a cell
Find fields keeps a cell that holds printed text only when the text leaves an empty part of at least about 10 mm and half of the cell. A label with a wide empty part after it ("Signature: ......") stays a field; a cell filled by its label ("Name:", a column header) does not. Very small cells (under about 5 mm wide or 2 mm high) are never fields. Typed values in a saved copy do not count as printed text.

## A cell shows as filled, but I can still click it
A cell with a saved value shows as filled. A click on it opens the saved value for editing; the page hides the old value while you edit. The next save replaces the old value. To keep the old value, delete the edit before you save.

## The end of a long value is missing
A value longer than its cell is clipped at the cell edge, on the page and in the saved file, so it does not cover the next cell. Make the font smaller in the value controls, or drag the right edge of the value box wider.
