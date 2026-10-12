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

### Changed

- The update check compares GitHub releases, not the local git commit. The
  "Update" banner and the local-source updater button are gone; download
  and install of an update come later in plan 119.
- About is the last section of Settings.
- `scripts/test-privacy.ps1` allows `reqwest` only in
  `src-tauri/src/services/release_check.rs`.

### Fixed

- Troubleshooting guide: the database is `app.db` (not `state.db`), and the
  data and log folders are under `%APPDATA%\PdfEditor\PdfEditor\data`.
