# Install contract

Plan 119 replaces the per-machine MSI with a per-user Inno Setup 6 setup.
This page lists what the old MSI installed, where PDF Editor keeps its data,
what the new setup installs, and how the setup and the app find an earlier
install. Owner decisions (2026-10-12): the setup detects an old MSI and
stops with a message to uninstall it first (no automatic migration, no
administrator rights); the setup EXE is unsigned and ships with SHA-256
sums.

## Old MSI (plan 047, `src-tauri/windows/main.wxs`)

| Item | Value |
|---|---|
| Product name | `PDF Editor` |
| UpgradeCode | `{7C8D4E2A-9B1F-4D3A-8A6B-1E2F3C4D5E6F}` (`tauri.conf.json` `bundle.windows.wix.upgradeCode`) |
| Packed UpgradeCode | `A2E4D8C7F1B9A3D4A8B6E1F2C3D4E5F6` |
| ProductCode | New for every build (`Id="*"`) |
| Scope | Per-machine (`InstallScope="perMachine"`), needs administrator rights |
| Install path | `%ProgramFiles%\PDF Editor\` (the wizard lets the user choose another folder) |
| Uninstall entry | `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\{ProductCode}` |
| Uninstall keeps | Every user data store below. The MSI removes only its own files, shortcuts and registry values. |

Every MSI built since 2026-08-17 carries the fixed UpgradeCode. The earlier
WiX 4 template never produced a working MSI (`main.wxs` header).

## File associations

The MSI and the setup write the same per-user keys:

| Extension | Key | Behaviour |
|---|---|---|
| `.pdf` | `HKCU\Software\Classes\.pdf\OpenWithProgids` value `PdfEditor.pdf.1` | "Open with" entry only; the default PDF app does not change |
| `.pdf-pipeline` | `HKCU\Software\Classes\.pdf-pipeline` = `PdfEditor.pipeline.1` | Owned |
| `.pdf-project` | `HKCU\Software\Classes\.pdf-project` = `PdfEditor.project.1` | Owned |

Each ProgId has `shell\open\command` = `"<install dir>\pdf-editor.exe" "%1"`.

## User data

No installer creates these stores; the app creates them at first use. An
update, a reinstall and an MSI uninstall keep all of them.

| Store | Path | Owner |
|---|---|---|
| Backend settings | `%APPDATA%\PdfEditor\PdfEditor\data\settings.json` | `util/paths.rs` `settings_path` (`directories::ProjectDirs::from("com", "PdfEditor", "PdfEditor")`) |
| Database | `%APPDATA%\PdfEditor\PdfEditor\data\app.db` (SQLite WAL: also `app.db-wal`, `app.db-shm`). Tables: recent files, projects, project files and pipelines, pipeline presets, autosave, last session, jobs history, OCR hOCR cache | `util/paths.rs` `db_path` |
| Projects | `%APPDATA%\PdfEditor\PdfEditor\data\projects\` | `util/paths.rs` `projects_dir` |
| Pipeline presets | `%APPDATA%\PdfEditor\PdfEditor\data\pipeline-presets\` | `util/paths.rs` `pipeline_presets_dir` |
| User OCR languages | `%APPDATA%\PdfEditor\PdfEditor\data\tessdata-extra\` | `util/paths.rs` `tessdata_extra_dir` |
| Thumbnail cache | `%APPDATA%\PdfEditor\PdfEditor\data\thumbnails\` | `commands/render.rs` |
| Logs | `%APPDATA%\PdfEditor\PdfEditor\data\logs\`: daily `pdf-editor.<date>.log` (7 kept), crash files `<timestamp>.<kind>.txt` | `util/logging.rs`, `util/crash_logger.rs` |
| Signatures | `%APPDATA%\com.pdfeditor.app\signatures\` (Tauri `app_data_dir`, from the identifier `com.pdfeditor.app`) | `commands/signatures.rs` |
| WebView data | `%LOCALAPPDATA%\com.pdfeditor.app\EBWebView\` (WebView2 profile) | Tauri / WebView2 |
| Frontend stores (in the WebView localStorage) | `pdf-editor-app` (theme, language, privacy flag, save folder, zoom, open-last, autosave interval), `pdf-editor-prefill`, `pdf-editor.recentFonts`, `pdf-editor.recentColors.<tool>`, `theme`, `onboarded` | `src/stores/appStore.ts`, `src/stores/prefillStore.ts`, `src/lib/recentFonts.ts`, `src/lib/recentColors.ts`, `src/components/ThemeProvider.tsx`, `src/components/Onboarding.tsx` |
| Temporary files | `%TEMP%\pdf-editor-diff-<job>\` and pipeline work folders | `commands/compare.rs`, `pipeline/executor.rs` |

`settings.json` key `update_check_enabled` (default `false`) is the stored
consent for the update check. The app never overwrites a `settings.json` it
cannot parse; it reads it as "checks off" and shows the write error.

## Runtime payload

`packaging/payload.json` lists all 79 files, with the same layout as the MSI
(`tauri.conf.json` `bundle.externalBin` and `bundle.resources`):

| Kind | Count | Source | Installed to |
|---|---|---|---|
| Application | 1 | `src-tauri/target/release/pdf-editor.exe` | `{app}\pdf-editor.exe` |
| Sidecars | 5 | `src-tauri/sidecars/<name>-x86_64-pc-windows-msvc.exe` | `{app}\qpdf.exe`, `gswin64c.exe`, `mutool.exe`, `tesseract.exe`, `pdfcrack.exe` |
| Sidecar DLLs | 61 | `src-tauri/sidecars/*.dll` | `{app}\sidecars\` (`SidecarManager` puts this folder on the child `PATH`) |
| Tesseract data | 5 | `src-tauri/resources/tessdata/` (ces, deu, eng, pol, slk) | `{app}\resources\tessdata\` |
| RapidOCR | 7 | `src-tauri/resources/ocr/` (2 ONNX models, `onnxruntime.dll`, dictionary, 2 licences, provenance note) | `{app}\resources\ocr\` |

`{app}` is `%LOCALAPPDATA%\Programs\PDF Editor`.

- **PDFium:** not needed. No code loads it (`git grep -i pdfium` finds no
  use in `src-tauri` or `scripts`). Rendering uses MuPDF (`mutool`).
- **LibreOffice:** `sidecars/soffice.rs` expects
  `{app}\resources\libreoffice\App\libreoffice\program\soffice.exe`. Neither
  the MSI nor the setup ships it (`tauri.conf.json` has no resource for it,
  and `src-tauri/resources/libreoffice/` holds only a placeholder). Office
  conversion fails in every installed build until a later plan ships the
  tree. Open question for the owner.
- **WebView2:** the setup checks the registry (`pv` under
  `EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`) and, after a
  Yes, downloads the Microsoft bootstrapper. A silent setup without WebView2
  stops before it copies files.
- **Visual C++ runtime:** the sidecar DLL set carries its own
  `vcruntime140*.dll` and `msvcp140*.dll` in `{app}\sidecars\`.

## Per-user setup (`packaging/pdf-editor.iss`)

| Item | Value |
|---|---|
| AppId | `{77A403B7-BE43-4976-BB7B-4C0CE4E8D7CA}` (fixed; never change it) |
| Install path | `%LOCALAPPDATA%\Programs\PDF Editor` (no folder page) |
| Rights | `PrivilegesRequired=lowest`; no administrator rights |
| Uninstall entry | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{77A403B7-BE43-4976-BB7B-4C0CE4E8D7CA}_is1` |
| File name | `pdf-editor-setup-X.Y.Z.exe`, plus a `SHA256SUMS.txt` line |
| Signature | None (unsigned EXE). Compare the SHA-256 sum. |
| Languages | English and Slovak (Windows UI language decides) |

Behaviour when the setup starts:

1. **Old MSI found:** the setup shows the installed version, location and
   product code, tells the user to uninstall PDF Editor in Windows Settings
   first and says that the data stay. It then exits without changes. A
   silent setup exits with the same result and only logs it.
2. **Earlier setup install found:** older version, update (OK or Cancel);
   same version, reinstall (default Yes); newer version, downgrade (default
   No). A silent setup updates and reinstalls, and refuses a downgrade.
3. **WebView2 check** as above.

The uninstaller removes the program files, the shortcuts and the file
association keys. It keeps all user data. Uninstall choices for user data
come in the next lane of plan 119.

## Finding installed copies

The setup (`FindOldMsi` in Pascal Script) and the app
(`src-tauri/src/util/install_detect.rs`, `detect`) use the same lookup:

1. **MSI:** read the value names of
   `HKLM\SOFTWARE\Classes\Installer\UpgradeCodes\A2E4D8C7F1B9A3D4A8B6E1F2C3D4E5F6`
   (per-machine, 64-bit view) and of
   `HKCU\Software\Microsoft\Installer\UpgradeCodes\A2E4D8C7F1B9A3D4A8B6E1F2C3D4E5F6`
   (per-user). Each value name is a packed ProductCode. Unpack it and read
   `DisplayVersion` and `InstallLocation` from `...\Uninstall\{ProductCode}`
   in the same hive.
2. **Setup:** read `DisplayVersion` and `InstallLocation` from the `_is1`
   key above.

Packed GUID: reverse the first three groups character by character, swap
the two hex digits of every byte in the last two groups, drop braces and
dashes, upper case. `src-tauri/tests/install_contract_test.rs` fails when
the AppId, the packed UpgradeCode in the `.iss` file and the Rust constants
drift apart.

## Update check

The app asks `https://api.github.com/repos/SouthCarpet/pdf-editor/releases/latest`
for the latest release, only when `update_check_enabled` is on. It checks at
app start (silent: only a dot on the Settings button when a newer version
exists), when the About section opens and after a click on **Check now**.
With the consent off, no path sends a request. Only a stable tag `vX.Y.Z`
or `X.Y.Z` that is numerically newer than the running version counts;
pre-releases and drafts never count. A connection error and an unusable
GitHub answer show as their own status, never as "latest version". The
check downloads nothing; download and apply come in the next lane.
