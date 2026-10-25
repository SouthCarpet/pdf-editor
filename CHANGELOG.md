# Changelog

## Unreleased

The app uses Fira Sans and the Kaliber r4 design language.

- App styles now read Kaliber roles directly; the old token aliases are removed.
  Field fills, warning text, native select arrows, type sizes and radii keep
  their previous values.

### Added

- Thumbnail image carry into the workspace page (about 200 ms), with
  instant reduced-motion and unsupported-browser paths.
- Keyboard focus and arrow-key resizing on own-field edge handles.

- Full AGPL-3.0 licence text and third-party component notices.
- Move, resize and delete saved own fields in Forms, with undo and redo.
  Only fields carrying the new ownership marker offer layout editing.

- Draw, name, move, resize and delete pending text fields and checkboxes in Forms. Save writes real AcroForm fields; undo, redo and read-only previews are included.

- Own field model: text boxes use 140 x 22 pt, checkboxes use 14 x 14 pt,
  and drawn boxes have a 12 pt minimum on each side. Boxes stay on the page.
  Pending own fields support undo and redo, the shared save path, the close
  guard and autosave. A move made during save stays pending and replaces
  the written field on the next save. Empty own fields do not enter prefill
  history.
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

- Workspace tool bar, tool panels, form controls and Konva selection layers
  now use Kaliber roles. Controls use flat surfaces without press scales.

- Workspace pages now sit on a well-coloured canvas with a flat sheet and a
  hairline border. The thumbnail rail uses quiet surfaces and visible keyboard focus.

- The dark theme background and surfaces are darker, from the shared Kaliber tokens.

- Password recovery uses Kaliber choices, inputs, estimate and result marks, and a flat form layout. The legal warning uses the shared keyboard-accessible dialog.
- Kaliber r4, step two: the shell and Settings. The header has four tabs
  (Tools, Projects, Pipeline, Settings last) and a sun and moon switch for
  Light and Dark. The footer has a Help link. F1 opens a help panel with
  search, topics, all keyboard shortcuts and "Show tour again". Ctrl+comma
  opens Settings. A found update shows as a quiet "Update available" line in
  the header, not as a dot. Settings has Appearance (theme as Light, Dark,
  System; language), Saving and opening, OCR languages, Updates and About
  (last). About lists the licences of the app, Fira Sans and the OCR parts.
  The buttons, fields, dialogs, menus, toasts and the unsaved-changes dialog
  use the Kaliber controls. The theme has one saved copy only (`kaliber-theme`);
  the old `theme` field in the app store is gone.
- Rust code stays under cognitive complexity 12. `src-tauri/.clippy.toml`
  sets `cognitive-complexity-threshold = 12`. Long functions in the
  pipeline executor, OCR, optimize, export and sidecar code are split into
  helpers. Behaviour is the same.
- The app now uses the Kaliber r4 design language, step one: the face is
  Fira Sans, the colours come from the shared Kaliber tokens (accent hue 235,
  light and dark), and the theme choice is saved under `kaliber-theme`
  (a choice saved under the old `theme` key moves over once). Screen changes
  are listed below. The licence of Fira Sans (SIL OFL
  1.1) is installed to `resources\licenses\FiraSans-OFL.txt`.
  Warning text uses a new role that meets 4.5:1, and the type sizes, the page
  text size and the corner radii keep their previous values.
- Kaliber r4, step two (Home and tool pages): the tools on Home are a plain
  list of link rows, not a grid of cards, and the **Tools** heading leads the
  page. Tool pages use the Kaliber controls (select with a permanent label,
  slider with its value, check box, radio) in place of own styles. The job
  list shows each state as a mark and a word (Waiting, Running, Done, Failed,
  Cancelled), and a running job has a progress bar instead of a spinner. The
  Compress result and the Unlock messages are now translated (English and
  Slovak).
- Kaliber r4, step two (Projects and Pipeline): the project list is a ruled
  table (name, description, update date) with the count under the title in the
  right plural form (Slovak: 1 projekt, 2 projekty, 5 projektov). The project
  page has the project name as its lead, and files and attached pipeline
  presets are ruled tables with the action in its own column. Deleting a
  project or a pipeline preset asks in a dialog that names it and gives the
  item counts, not a native confirm. The Run pipeline window is a modal dialog
  with a progress bar, a mark and a word for each file, and node names in the
  preflight warnings instead of node ids. The graph canvas, nodes and warning
  edges take their colours from the Kaliber tokens, with no shadow. The text of
  the project page, the Run pipeline window and the Watermark and Save steps is
  translated (English and Slovak). The button that copies the first output path
  is now called **Copy output path** (it was **Open output folder**).
- Replace the removed scanned timesheet with a synthetic image-only fixture,
  `timesheet-scan.pdf`, generated by `scripts/generate-timesheet-fixture.js`.

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

- Restore the gap between the workspace page and the top of its well.
- Restore unchecked switch edges in both themes and keep settings labels
  beside their switches.
- Render the clicked page before taking carry snapshots, so PDF animation
  frames cannot block the page change. Skip the carry after a 200 ms wait.
- Split autosave validation and page overlay decisions to meet the
  complexity limit without changing their behaviour.
- Keep Save as the close dialog's single solid action; outline Discard
  with the danger colour.
- Use muted, regular-weight workspace toolbar labels. Selected and hover
  states keep WCAG AA text contrast.
- Use a 1 px danger edge without a shadow for file-opening alerts.

- Own-field preview labels now use the foreground paired with the accent-soft
  fill in both themes, including saved fields opened for layout editing.
- Saved signature deletion now uses the shared confirmation dialog with the
  signature name. Drawing uses the shared dialog focus and keyboard pattern.

- FreeText annotations select a free page font name and keep existing font
  bindings. Their default and normal appearances use the same new name.

- Last-resort text replacement keeps images and existing fonts, including
  indirect resources and font dictionaries. It now selects a free font
  resource name instead of replacing an existing `/F1` binding.

- Saving values on pages with indirect resources preserves existing images
  and font resources.

- Annotations on a page with an indirect /Annots list were dropped when saving or deleting an annotation.
- Troubleshooting guide: the database is `app.db` (not `state.db`), and the
  data and log folders are under `%APPDATA%\PdfEditor\PdfEditor\data`.
