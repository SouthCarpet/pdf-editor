# PDF Editor

Localhost-only Windows desktop application for handling PDF files. 12 tools, offline by default, no paywalls, no LLM, no telemetry. The only network request is an opt-in update check against GitHub releases (off by default, see [Update check](#update-check)).

Personal use project, not publicly distributed.

## Features

- Merge, Split, Extract pages, Organize (rotate / delete / reorder / insert blank)
- Compress (3 presets + Custom) and Optimize (modular pipeline)
- Edit Tier 1+2+3 (forms / annotations / real inline text edit with proper Type0 CIDFont embedding)
- Crop (manual + auto-detect content + aspect lock + preset paper sizes)
- Compare (visual + text diff)
- Unlock (Type A & B + secondary brute-force Recovery: Dictionary + Brute)
- Convert PDF -> JPG / PNG / TIFF / TXT / HTML / DOCX / ODT / RTF / ePub / PDF/A
- Convert images + DOCX / ODT / XLSX / PPTX / HTML / RTF / ePub -> PDF
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

Build the setup yourself: [packaging/INSTALL.md](packaging/INSTALL.md).
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
MSI (`src-tauri/target/release/bundle/msi/`); the release workflow moves to
the setup in a later step of plan 119.

Tested on Windows 10/11 x64. MSVC toolchain required (Rust 1.85+).

## Documentation

- [Getting started](docs/user-guide/getting-started.md)
- [Tools reference](docs/user-guide/tools.md)
- [Troubleshooting](docs/user-guide/troubleshooting.md)
- [Install contract](docs/install-contract.md)
- [Changelog](CHANGELOG.md)
- [Architecture spec](docs/superpowers/specs/2026-05-10-pdf-editor-design.md)
- [Implementation plan](docs/superpowers/plans/2026-05-10-pdf-editor.md)
- [Stack](docs/stack.md)
- [Vault](.vault/) — engine specs, debug notes, ADRs
