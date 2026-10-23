# Release checklist

How a PDF Editor release is made and accepted. The agents build and check;
Michal runs the setup and accepts the release. Nobody runs a setup on the
development machine: use a test Windows user or a virtual machine.

## 1. Build

1. Set the same `X.Y.Z` in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`. Update `CHANGELOG.md` and every
   version-bearing sentence (README, About text, install and checksum text).
2. Push the tag `vX.Y.Z` (signed). The workflow `.github/workflows/release.yml`
   starts on every pushed `v*` tag and by hand (`workflow_dispatch`). It:
   - runs the payload and release check tests (`pnpm vitest run packaging`),
   - builds the setup with `packaging/build-installer.ps1` (no MSI),
   - runs `packaging/check-release.mjs`: the setup and `SHA256SUMS.txt`
     exist, the hash matches, the asset name is
     `pdf-editor-setup-X.Y.Z.exe`, the three manifests agree and the tag is
     `vX.Y.Z`,
   - on a tag run, attaches `pdf-editor-setup-X.Y.Z.exe` and
     `SHA256SUMS.txt` to a **draft** GitHub release (or replaces them on an
     existing draft release). `node packaging/check-release.mjs
     --release-action` reads `gh release view <tag> --json isDraft` first:
     a published release for the tag stops the job with exit code 1, so
     `--clobber` never replaces a published asset. Make a new version
     instead.
3. A manual run keeps the setup as the workflow artifact `setup` and
   creates no release.

## 2. Manual acceptance (Michal)

Use a test Windows user or a virtual machine. Keep the setup log:
`pdf-editor-setup-X.Y.Z.exe /LOG="%TEMP%\pdf-editor-setup.log"`.

1. **Checksum.** `Get-FileHash -Algorithm SHA256 .\pdf-editor-setup-X.Y.Z.exe`
   equals the line in `SHA256SUMS.txt`.
2. **Clean install.** No earlier PDF Editor. The setup installs into
   `%LOCALAPPDATA%\Programs\PDF Editor` without an administrator prompt.
   Open a PDF, run OCR on a scan and convert a PDF to PNG.
3. **LibreOffice prompt.** Without LibreOffice, the setup asks "PDF Editor
   converts Office files with LibreOffice. It is not installed. Install it
   now?" with No as the default. No: the setup finishes and Office
   conversion shows the download link. Yes with `winget`: winget installs
   LibreOffice (an administrator prompt is normal), the log shows
   `LibreOffice: winget exit code`. Yes without `winget`: the browser opens
   the LibreOffice download page. A failure only shows a warning. A silent
   setup (`/VERYSILENT`) never asks.
4. **Old MSI.** With the old MSI installed, the setup stops with the
   uninstall message and changes nothing.
5. **Update from an older test build.** Install an older test setup,
   create settings, a project and a signature. Turn on **Check GitHub for
   new versions** in Settings > About. With the new release published, About
   shows **Update to X.Y.Z**. Leave a document with unsaved changes open and
   click it: the unsaved-changes dialog comes first. Then the app downloads,
   checks and starts the setup and closes. The setup updates in place; the
   data stay; the setup offers to start PDF Editor.
6. **Cancel.** Start the update again and click Cancel in the setup
   wizard. The installed version still starts and the data stay.
7. **Uninstall combinations.** Settings > Apps > Installed apps > PDF Editor
   > Uninstall. The uninstaller asks two questions, both default No:
   - No, No: all data stay.
   - Yes, No: settings, database, projects, presets, OCR languages,
     thumbnails, logs and WebView data go; signatures stay.
   - No, Yes: only the signatures go.
   - Yes, Yes: both go.
   In every case PDF files and files PDF Editor did not create stay,
   except in the WebView2 profile `EBWebView`, which goes as a whole
   (its PDF files stay). A
   silent uninstall (`unins000.exe /VERYSILENT`) asks nothing and keeps all
   data. The file associations are gone after each uninstall.
8. **Publish.** Publish the draft release only after steps 1 to 7 pass,
   and not while the release workflow runs: the job reads the draft state
   once, just before it uploads.
   Only then does the update check of installed apps see it.
