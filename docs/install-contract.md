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
| `.pdf` | `HKCU\Software\Classes\.pdf\OpenWithProgids` value `PdfEditor.pdf.1` | "Open with" entry only. The setup never claims `.pdf` as the default and has no task for it; the user's default PDF app does not change |
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
| Frontend stores (in the WebView localStorage) | `pdf-editor-app` (theme, language, save folder, zoom, open-last, autosave interval), `pdf-editor-prefill`, `pdf-editor.recentFonts`, `pdf-editor.recentColors.<tool>`, `theme`, `onboarded`, `i18nextLng` (the language detector cache) | `src/stores/appStore.ts`, `src/stores/prefillStore.ts`, `src/lib/recentFonts.ts`, `src/lib/recentColors.ts`, `src/components/ThemeProvider.tsx`, `src/components/Onboarding.tsx`, `src/i18n/index.ts` (i18next language detector, default `lookupLocalStorage`) |
| Temporary files | `%TEMP%\pdf-editor-diff-<job>\` and pipeline work folders | `commands/compare.rs`, `pipeline/executor.rs` |

`settings.json` key `update_check_enabled` (default `false`) is the stored
consent for the update check and the only network control. The app never
overwrites a `settings.json` it cannot parse; it reads it as "checks off"
and shows the write error.

The "Strict privacy mode" switch and its keys are gone (plan 119): the
switch never blocked a request. Migration: when `settings.json` still holds
`privacy_strict: true`, the app sets `update_check_enabled` to `false` once
and drops the key; `privacy_strict: false` is only dropped. The frontend
drops `privacyStrict` from `pdf-editor-app` the next time it stores that
blob.

## Runtime payload

`packaging/payload.json` lists all 80 files, with the same layout as the MSI
(`tauri.conf.json` `bundle.externalBin` and `bundle.resources`):

| Kind | Count | Source | Installed to |
|---|---|---|---|
| Application | 1 | `src-tauri/target/release/pdf-editor.exe` | `{app}\pdf-editor.exe` |
| Sidecars | 5 | `src-tauri/sidecars/<name>-x86_64-pc-windows-msvc.exe` | `{app}\qpdf.exe`, `gswin64c.exe`, `mutool.exe`, `tesseract.exe`, `pdfcrack.exe` |
| Sidecar DLLs | 61 | `src-tauri/sidecars/*.dll` | `{app}\sidecars\` (`SidecarManager` puts this folder on the child `PATH`) |
| Tesseract data | 5 | `src-tauri/resources/tessdata/` (ces, deu, eng, pol, slk) | `{app}\resources\tessdata\` |
| RapidOCR | 7 | `src-tauri/resources/ocr/` (2 ONNX models, `onnxruntime.dll`, dictionary, 2 licences, provenance note) | `{app}\resources\ocr\` |
| Font licence | 1 | `src/assets/fonts/fira-sans/OFL.txt` (SIL OFL 1.1 of Fira Sans, whose four TTF files sit inside the app) | `{app}\resources\licenses\FiraSans-OFL.txt` |

`{app}` is `%LOCALAPPDATA%\Programs\PDF Editor`.

- **PDFium:** not needed. No code loads it (`git grep -i pdfium` finds no
  use in `src-tauri` or `scripts`). Rendering uses MuPDF (`mutool`).
- **LibreOffice:** not bundled (owner decision, ledger 9482). See
  "LibreOffice" below.
- **WebView2:** the setup checks the registry (`pv` under
  `EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`) and, after a
  Yes, downloads the Microsoft bootstrapper. A silent setup without WebView2
  stops before it copies files.
- **Visual C++ runtime:** the sidecar DLL set carries its own
  `vcruntime140*.dll` and `msvcp140*.dll` in `{app}\sidecars\`.

Third-party licence inventory: [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).
The inventory is repository documentation; it adds no installer payload files.
The payload already includes the two OCR licence texts listed above. DLL
entries marked "unknown, to check" still need review before binary distribution.

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
4. **LibreOffice check** after the files are installed (see
   "LibreOffice" below).

The uninstaller removes the program files, the shortcuts and the file
association keys. It never claims or changes the default `.pdf` app. User
data: see "Uninstall choices" below.

## Uninstall choices

An interactive uninstall asks two questions; both default to No:

| Question | Part passed to `pdf-editor.exe --remove-user-data` | What goes |
|---|---|---|
| Remove your PDF Editor data too? | `app-data` | In `%APPDATA%\PdfEditor\PdfEditor\data`: the files `settings.json`, `app.db`, `app.db-wal`, `app.db-shm`. In its folders only the files the app names: `projects\*.pdf-project`, `pipeline-presets\*.pdf-pipeline`, `tessdata-extra\*.traineddata`, `thumbnails\<24 hex digits>.png`, `logs\pdf-editor.YYYY-MM-DD.log` and `logs\YYYY-MM-DD_HH-MM-SS.panic.txt` / `.crash.txt`. The WebView2 profile `%LOCALAPPDATA%\com.pdfeditor.app\EBWebView` as a whole (it holds the frontend stores above). |
| Remove your saved signatures too? | `signatures` | In `%APPDATA%\com.pdfeditor.app\signatures`: `index.json` and the `*.png` signature images |

Rules (`src-tauri/src/util/uninstall_data.rs`, tests in
`uninstall_data_tests.rs` over an isolated tree):

- The delete set comes only from fixed names in `uninstall_data.rs`
  (`APP_DATA_FILES`, `APP_DATA_STORES`, `WEBVIEW_DIR`, `SIGNATURES_DIR`,
  `SIGNATURE_INDEX`). No setting and no argument can make it larger.
- A `*.pdf` file is never deleted, also inside the listed folders.
  Exported PDFs saved anywhere else are never touched.
- Every file outside the list stays, also an unknown file (for example
  `notes.txt` or `photo.jpg`) inside a listed folder, and every subfolder
  of `projects`, `pipeline-presets`, `tessdata-extra`, `thumbnails`, `logs`
  and `signatures`. A folder that still holds anything stays; empty folders
  up to (not including) `%APPDATA%` and `%LOCALAPPDATA%` go.
- Exception: `EBWebView` goes as a whole except `*.pdf` files, also files
  that another program put there. Its subfolders go when they are empty.
- A read-only app file is deleted.
- Handles (`src-tauri/src/util/pinned_dir.rs`): every check reads an open
  handle, and every deletion goes through a handle; no path is checked and
  then used again.
  - Pin: before it deletes anything, the app opens every folder of the
    part and every folder between it and `%APPDATA%` / `%LOCALAPPDATA%`
    (`CreateFileW` with `FILE_FLAG_BACKUP_SEMANTICS |
    FILE_FLAG_OPEN_REPARSE_POINT`, share mode read only: no
    `FILE_SHARE_WRITE`, no `FILE_SHARE_DELETE`). On each handle it checks that the folder is a
    folder and not a reparse point (`GetFileInformationByHandleEx`,
    `FileAttributeTagInfo`) and that its real path
    (`GetFinalPathNameByHandleW`) is the expected path. The handles stay
    open until the part ends. While they are open, Windows refuses to
    rename these folders and (NTFS) any folder above them, and refuses a
    second open of them with write access (sharing violation, os error 32),
    so none of them can be swapped for a link, in place or by rename; tests
    prove this with a rename and a write open between the pin and the
    deletion.
  - Refusal: when one of these folders is a reparse point (junction,
    symbolic link, mount point), its real path is not the expected path, or
    Windows does not open it, the whole part is refused: nothing in it is
    deleted and the exit code is 3. The other part still runs.
  - Walk: a subfolder of `EBWebView` is pinned the same way when the walk
    enters it. A file is opened with `DELETE` access and
    `FILE_FLAG_OPEN_REPARSE_POINT`, checked on that handle (a file, not a
    reparse point, the expected path) and deleted through it
    (`SetFileInformationByHandle`, `FileDispositionInfoEx` with POSIX
    semantics, or `FileDispositionInfo` where that is not supported). An
    empty folder goes the same way through its own handle.
- A reparse point inside a folder (a junction, a symbolic link, a OneDrive
  placeholder) is never followed and never deleted, also when it appears
  after the folder was listed. It stays, so its folder stays too.
- Paths longer than 260 characters work. A OneDrive placeholder is a
  reparse point, so it stays (see `KNOWN_ISSUES.md`).
- Limits: `%APPDATA%` and `%LOCALAPPDATA%` themselves are used as Windows
  gives them (a link there is followed). The refusal to rename or write-open
  a pinned folder is tested on NTFS only (see `KNOWN_ISSUES.md`, "Limits of
  the link protection").
- Threat model: the pins protect against links and wrong paths that exist
  before the uninstaller opens the folders, and against changes while it
  holds them, as far as the Windows sharing rules allow. Another program
  that runs under the same user account is outside this protection,
  because Windows does not separate programs of one user.
- Exit codes: 0 done, 1 a file could not be deleted, 2 no user folders,
  3 a part was refused (a link, a moved folder or a folder Windows does not
  open).
- A silent uninstall asks nothing, never runs the removal and keeps all
  data. Two No answers keep all data too.
- The uninstaller logs the exit code; a non-zero code shows a message with
  the folder to clean by hand. Exit code 3 has its own message
  (`RemoveDataRefused`): a data folder is a link or Windows did not open
  it, so nothing in that part was deleted.
- `%TEMP%` work folders and the `%TEMP%\pdf-editor-update-<random>\` download
  folders are not touched.

## LibreOffice

PDF Editor does not bundle LibreOffice. The app
(`util/install_detect.rs` `find_libreoffice`, used by `sidecars/soffice.rs`)
and the setup (`LibreOfficeInstalled` in `pdf-editor.iss`) use the same
rule:

1. Read the default value of each key, in this order:
   `HKLM\SOFTWARE\LibreOffice\UNO\InstallPath` (64-bit view),
   `HKLM\SOFTWARE\WOW6432Node\LibreOffice\UNO\InstallPath` (32-bit install),
   `HKCU\SOFTWARE\LibreOffice\UNO\InstallPath` (per-user install).
2. The value is the LibreOffice `program` folder. LibreOffice counts as
   installed when `<that folder>\soffice.exe` exists.

Before the registry, the app also accepts a portable tree at
`<app folder>\resources\libreoffice\App\libreoffice\program\soffice.exe`
(developer builds; the setup never ships it). When nothing is found, Office
conversion fails with the error key `libreoffice_missing` and the download
page `https://www.libreoffice.org/download/download-libreoffice/`. PDF/A
export then uses Ghostscript.

When LibreOffice is missing, an interactive setup asks after the file copy:
"PDF Editor converts Office files with LibreOffice. It is not installed.
Install it now? About 350 MB, needs internet and administrator rights."
(default No). Yes runs
`winget install --id TheDocumentFoundation.LibreOffice -e --accept-package-agreements --accept-source-agreements`
when `%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe` exists (winget
checks the manifest hash; the log keeps the exit code), otherwise it opens
the download page through the shell's URL handler (`ShellExec`, never
`cmd`). A failure shows a warning and never stops the install. A silent
setup never installs LibreOffice. `src-tauri/tests/install_contract_test.rs`
fails when the keys, `soffice.exe`, the URL or the winget id drift apart.

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
check downloads nothing.

## Update download and start

Only after a click on **Update to X.Y.Z** in About, and only with
`update_check_enabled` on (`src-tauri/src/services/update_install.rs`,
commands `download_update` and `install_update`):

1. The frontend asks about unsaved work first (the unsaved-changes dialog:
   Save, Discard or Cancel), before the download and again before the
   start.
2. The app asks the releases API again. The tag must equal the tag of the
   check (`UpdateCheck.tag`); otherwise `release_changed`.
3. The release must hold the assets `pdf-editor-setup-X.Y.Z.exe` (exact
   name from the tag) and `SHA256SUMS.txt`; otherwise `no_setup`. The
   setup's listed `size` must be at most 512 MiB; otherwise `too_large`.
4. Every URL, also every redirect target (at most 5), must be `https://`
   on `api.github.com`, `github.com`, `objects.githubusercontent.com` or
   `release-assets.githubusercontent.com`; otherwise `blocked_host`.
5. `SHA256SUMS.txt` (at most 64 KiB) must hold a line for exactly that file
   name; otherwise `checksum_missing`.
6. The app pins `%TEMP%` (an open folder handle with share mode read only,
   so no `FILE_SHARE_WRITE` and no `FILE_SHARE_DELETE`,
   `src-tauri/src/util/pinned_dir.rs`) and makes a new
   folder `%TEMP%\pdf-editor-update-<random>\` in it (32 random hex digits,
   `DOWNLOAD_DIR_PREFIX`). A name that already exists, also as a link, is
   never used. It pins the new folder too and checks on that handle that it
   is a folder, not a reparse point, with the expected real path; otherwise
   `disk_error`. Both pins stay open through the download, the rename and
   the start, until the verified setup is dropped (a new download, or the
   app exits). While they are open, Windows refuses to rename or replace
   either folder (tested on NTFS). It also refuses a write open of `%TEMP%`.
   The new download folder is the one exception: it has share mode read
   and write, because Windows refuses the final rename into a folder that
   is not shared for writing. That folder is empty only until the `.part`
   file exists, and NTFS sets no reparse point on a folder that holds a
   file (see `KNOWN_ISSUES.md`, "Limits of the link protection"). The setup
   streams to
   `pdf-editor-setup-X.Y.Z.exe.part` in that folder, created as a new file
   with `FILE_FLAG_OPEN_REPARSE_POINT` (it fails when anything has that
   name) and checked on its handle. More bytes than the listed size:
   `too_large`. Fewer bytes or a broken transfer: `download_failed`. A
   write error (for example a full disk): `disk_error`. A different
   SHA-256: `checksum_mismatch`. Each failure deletes the partial file
   through its handle and then the empty folder. A good file is renamed to
   `pdf-editor-setup-X.Y.Z.exe` through the `.part` handle
   (`SetFileInformationByHandle`, `FileRenameInfo`, `ReplaceIfExists`
   false, target: the pinned folder's real path plus the name). When
   anything, also a link or a folder, has that name, Windows refuses: the
   result is `disk_error` and only the `.part` file is deleted. The folder
   stays after the start (see `KNOWN_ISSUES.md`).
7. `install_update` hashes that file again (`file_changed` when it
   differs), starts it without silent switches, so the wizard asks the
   user, and exits the app. It starts only the file that the download
   verified, never a path from the frontend. Limit: the setup file itself
   is not locked between this hash and the start (`KNOWN_ISSUES.md`,
   "Limits of the link protection").
   Threat model: the pins protect against links and wrong paths that exist
   before the app opens the folders, and against changes while it holds
   them, as far as the Windows sharing rules allow. Another program that
   runs under the same user account is outside this protection, because
   Windows does not separate programs of one user.

The HTTP client stays in `release_check.rs` (`HttpDownload`), the only file
`scripts/test-privacy.ps1` allows to use `reqwest`. The client uses no
system proxy (`KNOWN_ISSUES.md`).
