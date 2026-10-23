# PDF Editor

Localhost-only Windows desktop application for handling PDF files. 12 tools, offline by default, no paywalls, no LLM, no telemetry. The only network requests are the opt-in update check against GitHub releases and, after a click on **Update**, the download of the new setup (off by default, see [Update check](#update-check)).

Source code is available under AGPL-3.0-or-later.

## Features

- Merge, Split, Extract pages, Organize (rotate / delete / reorder / insert blank)
- Compress (3 presets + Custom) and Optimize (modular pipeline)
- Edit Tier 1+2+3 (forms / annotations / real inline text edit with proper Type0 CIDFont embedding)
- Fill scanned forms: detects one field per empty table cell or line, keeps typed values visible in every tool on the page in view and on the facing page of a book spread (page thumbnails do not show them), and saves them as FreeText annotations with an appearance stream (not flattened, not AcroForm values). Each save builds on the last saved copy, so earlier values stay. A click on a saved value edits it; the save replaces it, never adds a second value, and an emptied value is deleted. A document with native AcroForm fields on some pages still offers detection for the printed boxes that are not form fields. Typed AcroForm values count as unsaved work: the close guard asks, the toolbar Save writes them ([Tools reference](docs/user-guide/tools.md#edit))
- Crop (manual + auto-detect content + aspect lock + preset paper sizes)
- Compare (visual + text diff)
- Unlock (Type A & B + secondary brute-force Recovery: Dictionary + Brute)
- Convert PDF -> JPG / PNG / TIFF / TXT / HTML / DOCX / ODT / RTF / ePub / PDF/A
- Convert images + DOCX / ODT / XLSX / PPTX / HTML / RTF / ePub -> PDF (Office formats need an installed LibreOffice, see [Install](#install))
- OCR (Tesseract 5; bundles eng / slk / ces / deu; Slovak diacritics preserved via Type0 CIDFont). The OCR text layer embeds a full Latin editing alphabet (ASCII, Latin-1 Supplement, Latin Extended-A), not only the characters the scan contained, so you can edit the recognized text with any Slovak, Czech or German letter.
- Pipeline (chained operations via xyflow node editor) + Projects (collections)
- System font picker (all installed fonts, no Standard-14 fallback)
- Full configurability per tool: ColorPicker, B/I/U/S, alignment, sliders for DPI/quality/etc.

## Install

PDF Editor installs per user, without administrator rights, into
`%LOCALAPPDATA%\Programs\PDF Editor`.

1. Download `pdf-editor-setup-X.Y.Z.exe` and `SHA256SUMS.txt` from the
   GitHub release.
2. The setup EXE is not signed (Windows SmartScreen can warn). Compare its
   SHA-256 with the line in `SHA256SUMS.txt`:

   ```powershell
   Get-FileHash -Algorithm SHA256 .\pdf-editor-setup-X.Y.Z.exe
   ```

3. Run the setup. If the old MSI version is installed, the setup stops and
   asks you to uninstall it first (Settings > Apps > Installed apps >
   PDF Editor; Windows asks for administrator rights). The MSI uninstall
   keeps your settings, projects, presets, logs and signatures.
4. LibreOffice is not bundled. Office conversion (DOCX, ODT, XLSX, PPTX,
   RTF, ePub) needs an installed LibreOffice. When it is missing, the setup
   asks whether to install it (default No; about 350 MB, needs internet and
   administrator rights). Yes runs `winget install --id
   TheDocumentFoundation.LibreOffice`, or opens
   <https://www.libreoffice.org/download/download-libreoffice/> when winget
   is not there. A failure only shows a warning. A silent setup never
   installs it.

Uninstall: Settings > Apps > Installed apps > PDF Editor > Uninstall. The
uninstaller asks two questions, both default No: remove the app data
(settings, database, projects, presets, OCR languages, thumbnails, logs,
WebView data) and remove the saved signatures. Only files that PDF Editor
names itself go; PDF files and every other file stay, and so do their
folders. One exception: the WebView2 profile folder `EBWebView` goes as a
whole except its PDF files, also files that another program put there.
Before it deletes anything, the uninstaller opens every data folder and
every folder above it up to `%APPDATA%` / `%LOCALAPPDATA%` and keeps them
open, so Windows refuses to rename or replace them, or to open them for
writing, while it works (tested on NTFS). It deletes each file through its
own handle and never follows a
link. When a data folder is a link (junction or symbolic link) to another
place, or Windows does not open it, the uninstaller deletes nothing in that
part and says so. A silent uninstall keeps all data. This protects against
links and wrong paths that exist before the uninstaller opens the folders,
and against changes while it holds them, as far as the Windows sharing
rules allow. Another program that runs under your own account is outside
this protection, because Windows does not separate programs of one user.

Build the setup yourself: [packaging/INSTALL.md](packaging/INSTALL.md).
Known limits (proxy, LibreOffice, link protection):
[KNOWN_ISSUES.md](KNOWN_ISSUES.md).
Data paths, registry keys and the payload list:
[docs/install-contract.md](docs/install-contract.md).

## Update check

Settings > About shows the release version and commit of the build. The
**Check GitHub for new versions** option is off by default and is stored in
`settings.json` (`update_check_enabled`). When it is on, the app asks
`https://api.github.com/repos/SouthCarpet/pdf-editor/releases/latest` for the
latest release at app start (silent: a dot on the Settings button when a
newer version exists), when About opens and after **Check now**. When it is
off, no request leaves the machine. Only a stable `vX.Y.Z` release that is
newer than the running version counts. A connection error shows as its own
status, not as "latest version". The check downloads nothing.

When a newer release exists, About shows **Update to X.Y.Z**. A click asks
about unsaved work first, then downloads `pdf-editor-setup-X.Y.Z.exe` and
`SHA256SUMS.txt` from that release into a new folder
`%TEMP%\pdf-editor-update-<random>\`. The app keeps `%TEMP%` and that folder
open from the download to the start (or until it closes), so Windows
refuses to rename or replace them meanwhile (`%TEMP%` also refuses a write
open). The file is made new, never
through a link, and gets its final name only when nothing else has that
name. The app checks the SHA-256 sum, hashes the file again and starts the
setup with its wizard. PDF Editor then closes; the setup updates in place
and keeps your data. The download refuses a release whose tag changed after the check, a
host outside `api.github.com`, `github.com`, `objects.githubusercontent.com`
and `release-assets.githubusercontent.com` (also after a redirect), a file
larger than the release lists or than 512 MiB, an incomplete download and a
wrong hash. The app uses no system proxy (see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md)). The protection of the download covers
links and wrong paths that exist before the app opens the folders, and
changes while it holds them, as far as the Windows sharing rules allow.
Another program that runs under your own account is outside it, because
Windows does not separate programs of one user.

## Build

```
pnpm install
cargo fetch --manifest-path src-tauri/Cargo.toml
pwsh scripts/fetch-sidecars.ps1
pwsh scripts/stage-sidecars.ps1
pnpm gen:bindings
pwsh packaging/build-installer.ps1
```

Output: `packaging/output/pdf-editor-setup-<version>.exe` and
`packaging/output/SHA256SUMS.txt`. `pnpm tauri build` still builds the old
MSI (`src-tauri/target/release/bundle/msi/`), but no release ships it.

Release: a pushed tag `vX.Y.Z` starts `.github/workflows/release.yml`. It
builds the setup, runs the payload and release checks
(`packaging/check-release.mjs`) and attaches the setup and
`SHA256SUMS.txt` to a draft GitHub release. Steps and manual acceptance:
[docs/release-checklist.md](docs/release-checklist.md).

Tested on Windows 10/11 x64. MSVC toolchain required (Rust 1.85+).

The SQL migrations in `src-tauri/migrations/` must keep LF line endings: sqlx stores a hash of each file's bytes in the database, and a build from different bytes refuses an existing database ("was previously applied but has been modified"). `.gitattributes` pins `*.sql` to LF, and `tests/migration_checksums_test.rs` fails when a shipped migration changes. Change the schema with a new migration file.

## Documentation

- [Getting started](docs/user-guide/getting-started.md)
- [Tools reference](docs/user-guide/tools.md)
- [Troubleshooting](docs/user-guide/troubleshooting.md)
- [Install contract](docs/install-contract.md)
- [Release checklist](docs/release-checklist.md)
- [Known issues](KNOWN_ISSUES.md)
- [Changelog](CHANGELOG.md)
- [Architecture spec](docs/superpowers/specs/2026-05-10-pdf-editor-design.md)
- [Implementation plan](docs/superpowers/plans/2026-05-10-pdf-editor.md)
- [Stack](docs/stack.md)
- [Vault](.vault/) — engine specs, debug notes, ADRs

## Licence

PDF Editor is licensed under the GNU Affero General Public License, version 3 or later ([full text](LICENSE)). Third-party programs, libraries and OCR models keep their own licences; see [Third-party notices](THIRD-PARTY-NOTICES.md).
