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
The app looks for LibreOffice at `<install folder>\resources\libreoffice\App\libreoffice\program\soffice.exe` (`%LOCALAPPDATA%\Programs\PDF Editor\...` for the setup, `%ProgramFiles%\PDF Editor\...` for the old MSI). Neither the setup nor the MSI ships this tree yet, so Office conversion fails in installed builds.

## App crashes silently on launch
Check `%APPDATA%\PdfEditor\PdfEditor\data\logs\` (Settings -> Open logs folder) for the daily `pdf-editor.<date>.log` files and the `<timestamp>.<kind>.txt` crash files. Most launch crashes are missing Microsoft Visual C++ Redistributable; reinstall it from the Microsoft download site.

## Pipeline runs hang
A node may be waiting on a sidecar. Open Settings -> Diagnostics to see active sidecar PIDs. Cancel from the Pipeline run dialog; cancellation propagates to the running sidecars (kill_on_drop).

## Recent files don't appear
The SQLite database lives at `%APPDATA%\PdfEditor\PdfEditor\data\app.db`. If it gets corrupted, delete the file and restart, the app will recreate it (you'll lose recent files but no PDF content).

## Update check says "Cannot reach GitHub"
The update check (Settings -> About, off by default) could not connect: no internet, a proxy, or a firewall. This is not "latest version". Try again later with **Check now**. "GitHub did not send a usable release" means GitHub answered, but not with a stable `vX.Y.Z` release (for example HTTP 403 when the hourly GitHub API limit is used up).

## Setup says the old MSI version is installed
Uninstall PDF Editor in Settings -> Apps -> Installed apps (Windows asks for administrator rights), then run the setup again. The MSI uninstall keeps your data in `%APPDATA%\PdfEditor\PdfEditor\data` and `%APPDATA%\com.pdfeditor.app`.
