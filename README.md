# PDF Editor

Localhost-only Windows desktop application for handling PDF files. 12 tools, fully offline, no paywalls, no LLM, no telemetry.

Personal use project, not publicly distributed.

## Features

- Merge, Split, Extract pages, Organize (rotate / delete / reorder / insert blank)
- Compress (3 presets + Custom) and Optimize (modular pipeline)
- Edit Tier 1+2+3 (forms / annotations / real inline text edit with proper Type0 CIDFont embedding)
- Fill scanned forms: detects one field per empty table cell or line, keeps typed values visible in every tool on the page in view and on the facing page of a book spread (page thumbnails do not show them), and saves them as FreeText annotations with an appearance stream (not flattened, not AcroForm values). Each save builds on the last saved copy, so earlier values stay. A click on a saved value edits it; the save replaces it, never adds a second value, and an emptied value is deleted. A document with native AcroForm fields on some pages still offers detection for the printed boxes that are not form fields. Typed AcroForm values count as unsaved work: the close guard asks, the toolbar Save writes them ([Tools reference](docs/user-guide/tools.md#edit))
- Crop (manual + auto-detect content + aspect lock + preset paper sizes)
- Compare (visual + text diff)
- Unlock (Type A & B + secondary brute-force Recovery: Dictionary + Brute)
- Convert PDF -> JPG / PNG / TIFF / TXT / HTML / DOCX / ODT / RTF / ePub / PDF/A
- Convert images + DOCX / ODT / XLSX / PPTX / HTML / RTF / ePub -> PDF
- OCR (Tesseract 5; bundles eng / slk / ces / deu; Slovak diacritics preserved via Type0 CIDFont). The OCR text layer embeds a full Latin editing alphabet (ASCII, Latin-1 Supplement, Latin Extended-A), not only the characters the scan contained, so you can edit the recognized text with any Slovak, Czech or German letter.
- Pipeline (chained operations via xyflow node editor) + Projects (collections)
- System font picker (all installed fonts, no Standard-14 fallback)
- Full configurability per tool: ColorPicker, B/I/U/S, alignment, sliders for DPI/quality/etc.

## Build

```
pnpm install
cargo fetch --manifest-path src-tauri/Cargo.toml
pwsh scripts/fetch-sidecars.ps1
pwsh scripts/stage-sidecars.ps1
pnpm gen:bindings
pnpm tauri build
```

Output: `src-tauri/target/release/bundle/msi/PDF Editor_<version>_x64_en-US.msi`

Tested on Windows 10/11 x64. MSVC toolchain required (Rust 1.85+).

The SQL migrations in `src-tauri/migrations/` must keep LF line endings: sqlx stores a hash of each file's bytes in the database, and a build from different bytes refuses an existing database ("was previously applied but has been modified"). `.gitattributes` pins `*.sql` to LF, and `tests/migration_checksums_test.rs` fails when a shipped migration changes. Change the schema with a new migration file.

## Documentation

- [Getting started](docs/user-guide/getting-started.md)
- [Tools reference](docs/user-guide/tools.md)
- [Troubleshooting](docs/user-guide/troubleshooting.md)
- [Architecture spec](docs/superpowers/specs/2026-05-10-pdf-editor-design.md)
- [Implementation plan](docs/superpowers/plans/2026-05-10-pdf-editor.md)
- [Stack](docs/stack.md)
- [Vault](.vault/) — engine specs, debug notes, ADRs
