# PDF Editor per-user setup

The setup installs PDF Editor for the current Windows user, without
administrator rights, into `%LOCALAPPDATA%\Programs\PDF Editor`. The full
contract (data paths, registry keys, payload, MSI detection) is in
[`docs/install-contract.md`](../docs/install-contract.md).

## Build the setup

Prerequisites: Rust (MSVC), Node.js, pnpm 11, Inno Setup 6
(`winget install JRSoftware.InnoSetup`), and the staged sidecars and
tessdata:

```powershell
pnpm install
pwsh scripts/fetch-sidecars.ps1
pwsh scripts/stage-sidecars.ps1
pwsh packaging/build-installer.ps1
```

The script does this:

1. Builds the frontend (`tsc -b`, then `vite build`) and the release binary
   with `tauri build --no-bundle` (jobs 4). `--no-bundle` skips the MSI.
   `packaging/tauri.build-override.json` empties `beforeBuildCommand`,
   because the frontend is already built. Use `-SkipBuild` to reuse
   `src-tauri\target\release\pdf-editor.exe`.
2. Checks that the binary embeds the frontend bundle from `dist\assets`.
3. Runs `packaging/check-payload.mjs`. It stops the build when
   `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`
   do not carry the same `X.Y.Z` version, or when a file of
   `packaging/payload.json` (sidecar, DLL, tessdata, OCR model) is missing
   or empty. It writes `packaging\output\payload-files.iss` and
   `packaging\output\pdf-editor-payload-<version>.json` (size and SHA-256 of
   every file).
4. Compiles `packaging/pdf-editor.iss` with ISCC. ESET can read-lock a
   fresh setup EXE for 2 to 5 minutes, so the compile retries up to 10
   times, 30 seconds apart.
5. Writes `packaging\output\SHA256SUMS.txt` with one line:
   `<sha256>  pdf-editor-setup-<version>.exe`.

The build never runs the setup.

Update `packaging/payload.json` when a sidecar upgrade changes its DLLs.
The payload check then fails until the list matches the staged files.

## Output

- `packaging\output\pdf-editor-setup-<version>.exe`
- `packaging\output\SHA256SUMS.txt`

The setup EXE is not signed. Windows SmartScreen can warn on first run.
Check the file before you run it:

```powershell
Get-FileHash -Algorithm SHA256 .\pdf-editor-setup-X.Y.Z.exe
```

The hash must equal the line in `SHA256SUMS.txt` of the same release.

## What the setup does

- **Old MSI install found:** the setup stops and tells you to uninstall
  PDF Editor first (Settings > Apps > Installed apps). The MSI uninstall
  needs administrator rights and keeps your settings, projects, presets,
  logs and signatures. Then run the setup again.
- **Earlier setup install found:** update (newer version), reinstall (same
  version, default Yes) or downgrade (older version, default No).
- **WebView2 missing:** the setup asks to download the Microsoft
  bootstrapper. A silent setup without WebView2 stops before it copies
  files.
- **File associations:** `.pdf` in "Open with" only (never the default
  PDF app), `.pdf-pipeline` and `.pdf-project` opened by PDF Editor; all
  under `HKCU`.
- **LibreOffice missing** (registry rule in
  [`docs/install-contract.md`](../docs/install-contract.md)): after the
  files are installed, an interactive setup asks whether to install it
  (default No; about 350 MB, needs internet and administrator rights). Yes
  runs `winget install --id TheDocumentFoundation.LibreOffice -e
  --accept-package-agreements --accept-source-agreements` and logs the exit
  code, or opens the official download page in the default browser when
  `%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe` does not exist. A
  failure shows a warning and never stops the PDF Editor install. A silent
  setup never installs LibreOffice.

Silent install: `pdf-editor-setup-<version>.exe /SILENT` (or
`/VERYSILENT`). Add `/LOG="<path>"` to keep the setup log.

## Developer-only switches

Pass these to ISCC by hand, never for a release build:

- `/DWebView2Check=skip`: skips the WebView2 check and turns the launch
  offer off.
- `/DAppIdGuid=<guid>`: a throwaway AppId, so an acceptance test does not
  touch a real install.

## Release

`.github/workflows/release.yml` builds this setup on a pushed `vX.Y.Z` tag
(and by hand), runs `packaging/check-release.mjs` and attaches the setup and
`SHA256SUMS.txt` to a draft GitHub release. See
[`docs/release-checklist.md`](../docs/release-checklist.md).

## Uninstall

Settings > Apps > Installed apps > PDF Editor > Uninstall. The uninstaller
first asks two questions (both default No), then removes the program files,
the shortcuts and the file associations:

1. **Remove your PDF Editor data too?** Settings, database, projects,
   pipeline presets, OCR languages, thumbnails, logs and the WebView data.
2. **Remove your saved signatures too?** The signature images in
   `%APPDATA%\com.pdfeditor.app\signatures`.

The uninstaller runs `pdf-editor.exe --remove-user-data [app-data]
[signatures]` for the parts you chose (`src-tauri/src/util/uninstall_data.rs`).
PDF files and files PDF Editor did not create are never removed; a folder
that still holds one stays. One exception: the WebView2 profile
`EBWebView` goes as a whole (its PDF files stay). The uninstaller keeps
every data folder open while it works and deletes each file through its
own handle, so it never follows a link. When a data folder is a link
(junction or symbolic link) to another place, or Windows does not open
it, nothing in that part is removed and the uninstaller says so (exit
code 3). A silent uninstall (`unins000.exe /SILENT` or
`/VERYSILENT`) asks nothing and keeps all data. The exact boundaries are in
[`docs/install-contract.md`](../docs/install-contract.md).
