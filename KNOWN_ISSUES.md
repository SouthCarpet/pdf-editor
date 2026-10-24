# Known issues

Limits we know about and accept for now. Each entry says what happens, why,
and what to do instead.

## Own fields support text and checkboxes

Own fields can be single-line text, multiline text or checkboxes. Choice,
radio and signature fields are not available as own fields. A pending box
defines the field only. Save it first, then fill its value in the Forms
list or another PDF reader. The field name is a label, not a filled value.

## Update check and download fail behind a corporate proxy

**What happens.** With the update consent on (Settings -> About), the
release check shows "Cannot reach GitHub" on a network that allows the
internet only through an HTTP proxy. **Update** fails the same way.

**Why.** The HTTP client in `src-tauri/src/services/release_check.rs` is
built without system proxy support (`reqwest` with `default-features =
false`, rustls only). It connects to GitHub directly and does not read the
Windows proxy settings or `HTTPS_PROXY`. Owner decision (plan 119): no code
change for now.

**Instead.** Download `pdf-editor-setup-X.Y.Z.exe` and `SHA256SUMS.txt`
from the GitHub release page in a browser, compare the SHA-256 sum
(`Get-FileHash .\pdf-editor-setup-X.Y.Z.exe -Algorithm SHA256`) and run
the setup. Your data stay.

## Old update downloads stay in the temp folder

**What happens.** Each **Update** makes a new folder
`%TEMP%\pdf-editor-update-<random>\` with the setup (more than
100 MiB). The app does not delete the folders of earlier updates.

**Why.** The download folder has a random name and is always new. The app
keeps it open from the download to the start, so while PDF Editor runs no
other program can rename it or swap it for a link (plan 119). The app
deletes nothing in `%TEMP%` that it did not make in the same run. While PDF
Editor runs, you cannot delete the folder of the last download either.

**Instead.** Close PDF Editor, then delete the `pdf-editor-update-*`
folders in `%TEMP%`, or run Windows Disk Cleanup or Storage Sense.

## Limits of the link protection

**What happens.** The uninstall cleanup and the update download open each
folder they use and keep it open, and check every folder and file on its
open handle (`src-tauri/src/util/pinned_dir.rs`). Tests prove on NTFS that
Windows then refuses to rename such a folder or a folder above it, and
refuses to open it for writing (so nobody can set a link in place). This
protects against links and wrong paths that exist before the app opens the
folders, and against changes while it holds them, as far as the Windows
sharing rules allow. Some limits stay:

- Another program that runs under your own account is outside this
  protection, because Windows does not separate programs of one user.
- The new update download folder allows write sharing, because Windows
  refuses the final rename into a folder that is not shared for writing.
  It is empty only until the `.part` file exists, and NTFS sets no link on
  a folder that holds a file. In that short moment a program of the same
  user could still set a link. This is a known limit.

- `%APPDATA%`, `%LOCALAPPDATA%` and `%TEMP%` themselves are used as Windows
  gives them. When one of them is a link, the app works in its target.
- The rename refusal is tested on NTFS only. On other file systems every
  handle still has its real path checked when it opens.
- Between the second SHA-256 check and the start of the setup, the setup
  file itself is not locked. A program that runs as the same user could
  change it in that moment.
- The WebView2 profile `EBWebView` is deleted as a whole except PDF files,
  also files that another program put there.

**Why.** A program that runs as the same user has the same rights as PDF
Editor. The app can stop a link from redirecting its own deletes and
writes, but it cannot stop such a program from changing files directly.

**Instead.** Nothing to do for normal use.

## Uninstall keeps data in linked or cloud folders

**What happens.** When a data folder, or a folder between it and
`%APPDATA%` / `%LOCALAPPDATA%`, is a junction, a symbolic link or a mount
point, the uninstaller deletes nothing in that part and shows a message
(exit code 3). A link inside a data folder, also a OneDrive placeholder
(files on demand), stays, and so does its folder. Paths longer than 260
characters are no problem.

**Why.** A link can point outside the app's folders. The uninstaller
never follows one: it keeps every folder of the part open while it works,
so no folder can be swapped for a link meanwhile, and it deletes each file
through its own handle. A link that appears after the folder was listed
stays too. So a link cannot make it delete files outside the app's
folders. Inside `EBWebView` it deletes every file except PDF files (see
"Limits of the link protection").

**Instead.** Delete the data by hand. The paths are in
`docs/install-contract.md`, "User data".

## Office conversion needs LibreOffice

**What happens.** Converting Office files (DOCX, ODT, RTF, ePub) shows
"Office conversion needs LibreOffice" when LibreOffice is not installed.
PDF/A export then uses Ghostscript.

**Why.** PDF Editor does not bundle LibreOffice (owner decision, plan 119):
it is about 350 MB and has its own updates.

**Instead.** Install LibreOffice from
<https://www.libreoffice.org/download/download-libreoffice/>. The setup
offers this when LibreOffice is missing. The detection rule is in
`docs/install-contract.md`.
