# Troubleshooting

## "Sidecar failed: timeout"
The bundled sidecar (qpdf / Ghostscript / MuPDF / Tesseract / pdfcrack) exceeded its 120 s budget. Usually a very large or corrupted PDF. Try splitting the input first, or run Optimize before the failing tool.

## OCR loses diacritics
Make sure the OCR language matches the document language. Slovak, Czech, and German tessdata files are bundled. For other languages, drop the `.traineddata` file into Settings -> OCR -> Languages, then re-run.

## "Password required"
The PDF has a user-open password (Type B). Type it in the Unlock tool. For permission-locked (Type A) PDFs the Unlock tool removes the lock without a password. For unknown passwords, switch to Recovery and pick Dictionary or Brute force mode. The Recovery mode control supports the arrow keys. Estimates use a half-filled square; a found password uses a filled square. The Legal warning dialog supports Escape to cancel.

## Compare reports false positives
Whitespace-only diffs can appear when fonts re-render slightly differently between source and target. Increase the diff threshold in the Compare panel.

## "Office conversion needs LibreOffice"
PDF Editor does not bundle LibreOffice. Install it from <https://www.libreoffice.org/download/download-libreoffice/> (or `winget install --id TheDocumentFoundation.LibreOffice -e`), then try again. The app finds LibreOffice through the registry: the default value of `SOFTWARE\LibreOffice\UNO\InstallPath` (HKLM, its 32-bit `WOW6432Node` copy, or HKCU) must name a folder with `soffice.exe`. A developer build also accepts a portable tree at `<app folder>\resources\libreoffice\App\libreoffice\program\soffice.exe`. PDF/A export falls back to Ghostscript without LibreOffice.

## App crashes silently on launch
Check `%APPDATA%\PdfEditor\PdfEditor\data\logs\` (Settings -> Open logs folder) for the daily `pdf-editor.<date>.log` files and the `<timestamp>.<kind>.txt` crash files. Most launch crashes are missing Microsoft Visual C++ Redistributable; reinstall it from the Microsoft download site.

## Pipeline runs hang
A node may be waiting on a sidecar. Open Settings -> Diagnostics to see active sidecar PIDs. Cancel from the Pipeline run dialog; cancellation propagates to the running sidecars (kill_on_drop).

## Recent files don't appear
The SQLite database lives at `%APPDATA%\PdfEditor\PdfEditor\data\app.db`. If it gets corrupted, delete the file and restart, the app will recreate it (you'll lose recent files but no PDF content).

## Find fields marks a label cell, or misses a cell
Find fields keeps a cell that holds printed text only when the text leaves an empty part of at least about 10 mm and half of the cell. A label with a wide empty part after it ("Signature: ......") stays a field; a cell filled by its label ("Name:", a column header) does not. Very small cells (under about 5 mm wide or 2 mm high) are never fields. Typed values in a saved copy do not count as printed text.

## A cell shows as filled, but I can still click it
A cell with a saved value shows as filled. A click on it opens the saved value for editing; the page hides the old value while you edit. The next save replaces the old value. To keep the old value, delete the edit before you save.

## The end of a long value is missing
A value longer than its cell is clipped at the cell edge, on the page and in the saved file, so it does not cover the next cell. Make the font smaller in the value controls, or drag the right edge of the value box wider.

## A typed value does not show in the page thumbnails
The thumbnails show the saved file only. A value that is not saved yet shows on the page in view and on the facing page of a book spread, not in the thumbnails. Save to see it in the thumbnails.

## A radio choice does not show on the page before I save
A typed AcroForm text, choice or checkbox value shows at its form field on the page. A radio group has one choice for several buttons, so the page does not show it before the save. The Forms panel shows the choice.

## I cleared a saved value but the cell still looks used
Save after you clear the text. The save deletes the saved value. If the cell still shows as filled, the clear is still unsaved: the toolbar Save button is active.


## Update check says "Cannot reach GitHub"
The update check (Settings -> About, off by default) could not connect: no internet, a proxy, or a firewall. This is not "latest version". Try again later with **Check now**. "GitHub did not send a usable release" means GitHub answered, but not with a stable `vX.Y.Z` release (for example HTTP 403 when the hourly GitHub API limit is used up).

Behind a corporate proxy the check and the download always fail: the app does not use the Windows proxy settings (see [KNOWN_ISSUES.md](../../KNOWN_ISSUES.md)). Download the setup and `SHA256SUMS.txt` in a browser instead.

## Update stops before the setup starts
**Update** refuses and says why when the latest release changed after the check (click **Check now** again), the release has no `pdf-editor-setup-X.Y.Z.exe` or no `SHA256SUMS.txt` line for it, the SHA-256 sum differs, the download is incomplete or larger than the release lists, a redirect leaves the GitHub hosts, the disk is full, or the file changed before the start. A refused file is deleted; nothing is started. Each download uses a new folder `%TEMP%\pdf-editor-update-<random>\`; you can delete old ones.

## Uninstall left files behind
The uninstaller removes your data only after a Yes, and never removes PDF files or files PDF Editor did not create, so their folders stay. One exception: the WebView2 profile folder `EBWebView` goes as a whole except its PDF files. When a data folder is a link (junction or symbolic link) to another place, or Windows does not open it, it deletes nothing in that part and says so. A link that another program makes while the uninstaller works is never followed and stays. A silent uninstall keeps all data. The data folders are listed in [docs/install-contract.md](../install-contract.md).

## Setup says the old MSI version is installed
Uninstall PDF Editor in Settings -> Apps -> Installed apps (Windows asks for administrator rights), then run the setup again. The MSI uninstall keeps your data in `%APPDATA%\PdfEditor\PdfEditor\data` and `%APPDATA%\com.pdfeditor.app`.
