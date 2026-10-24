# Changelog

## Unreleased

### Added

- Per-user Windows setup (Inno Setup 6): `packaging/pdf-editor.iss` and
  `packaging/build-installer.ps1`. Installs into
  `%LOCALAPPDATA%\Programs\PDF Editor` without administrator rights,
  handles update, reinstall and downgrade (downgrade default No), checks
  WebView2 and writes the per-user file associations. Unsigned EXE with a
  `SHA256SUMS.txt` line.
- The setup detects an old MSI install and stops with a message to
  uninstall it first. Data stay.
- Payload and version check (`packaging/check-payload.mjs`,
  `packaging/payload.json`): the build stops on a missing or empty sidecar,
  DLL, tessdata or OCR model file, and when `package.json`,
  `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` disagree on the
  version.
- Shared install detection (`src-tauri/src/util/install_detect.rs`) for
  the old MSI and the setup, with the same lookup as the setup.
- Opt-in update check against GitHub releases, stored as
  `update_check_enabled` in `settings.json` (off by default). With it on,
  the app checks at start (silent, a dot on the Settings button), when
  About opens and on **Check now**. A connection error shows apart from
  "latest version".
- About shows the release version.
- `docs/install-contract.md`: MSI identity, file associations, every data
  store with its path, the runtime payload.
- **Update to X.Y.Z** in About (after a click only, with the update consent
  on): asks about unsaved work, downloads `pdf-editor-setup-X.Y.Z.exe` and
  `SHA256SUMS.txt` from the checked release (GitHub hosts only, also after
  redirects; size from the release metadata, 512 MiB cap), checks the
  SHA-256 sum, hashes the file again before the start, starts the setup
  with its wizard and closes the app. A changed tag, a wrong hash, an
  incomplete download, a full disk and a changed file stop it with a
  reason. Each download goes to a new folder
  `%TEMP%\pdf-editor-update-<random>\`. The app keeps `%TEMP%` and that
  folder open (pinned) from the download to the start, so they cannot be
  renamed or swapped for a link meanwhile (the pins refuse a write open
  too; only the new download folder allows write sharing, for the final
  rename). The `.part` file is created new
  and never through a link, and the rename through its handle never
  replaces anything at the final name. This protects against links and
  wrong paths, not against another program that runs under your own
  account, and it is tested on NTFS only (KNOWN_ISSUES, "Limits of the
  link protection").
- The uninstaller asks two questions, both default No: remove the app data
  (settings, database, projects, presets, OCR languages, thumbnails, logs,
  WebView data) and remove the saved signatures. Only files the app names
  go (fixed names and name patterns); PDF files and every other file stay,
  and so do their folders. Exception: the WebView2 profile `EBWebView` goes
  as a whole except PDF files. Every data folder and the folders above it
  stay open (pinned) while the uninstaller works, and each file is deleted
  through its own handle, so a folder swapped for a link meanwhile is
  never followed (the pins share read only, so Windows refuses a second
  open with write access, which closes the in-place junction swap). A data
  folder that is a link (or has a link above it) is
  never followed: the uninstaller deletes nothing in that part and shows a
  message (exit code 3). A read-only app file is deleted. A silent
  uninstall keeps all data (`pdf-editor.exe --remove-user-data`,
  `src-tauri/src/util/uninstall_data.rs`, `src-tauri/src/util/pinned_dir.rs`).
  As for the update download, this protects against links and wrong paths,
  not against another program that runs under your own account, and it is
  tested on NTFS only (KNOWN_ISSUES, "Limits of the link protection").
- LibreOffice detection through the registry (app and setup share the
  rule). Without LibreOffice, Office conversion shows a message with the
  official download page; an interactive setup offers to install it with
  winget (default No) or opens the download page. A failure never stops
  the install.
- Release workflow: builds the per-user setup instead of the MSI, checks
  the setup, `SHA256SUMS.txt`, the asset name and the version against the
  tag (`packaging/check-release.mjs`), and attaches both files to a draft
  GitHub release on tag `vX.Y.Z`. A published release for the tag stops
  the job (`check-release.mjs --release-action`); assets are replaced only
  on a draft.
- `docs/release-checklist.md` (manual acceptance steps) and
  `KNOWN_ISSUES.md`.
- Own form fields, save side: the annotation type `form_field` (text or
  checkbox) is saved as a real AcroForm field with a unique name. A
  replaced or deleted own field is also removed from `/AcroForm /Fields`.
  A rect smaller than 4 x 4 pt fails the save with "own field rect must be
  finite and at least 4 x 4 pt".

### Changed

- The update check compares GitHub releases, not the local git commit. The
  "Update" banner and the local-source updater button are gone; download
  and install of an update come later in plan 119.
- About is the last section of Settings.
- `scripts/test-privacy.ps1` allows `reqwest` only in
  `src-tauri/src/services/release_check.rs`.

### Removed

- The "Strict privacy mode (block all network calls)" switch and its
  `privacy_strict` / `privacyStrict` keys: it never blocked a request. The
  update consent is the only network control. A stored
  `privacy_strict: true` turns the update consent off once; then the key
  is dropped.
- The MSI build and MSI smoke test in the release workflow.

### Known issues

- The update check and download do not use a system proxy
  (`KNOWN_ISSUES.md`).

### Fixed

- Annotations on a page with an indirect /Annots list were dropped when saving or deleting an annotation.
- Troubleshooting guide: the database is `app.db` (not `state.db`), and the
  data and log folders are under `%APPDATA%\PdfEditor\PdfEditor\data`.
