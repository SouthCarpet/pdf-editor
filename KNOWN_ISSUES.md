# Known issues

Limits we know about and accept for now. Each entry says what happens, why,
and what to do instead.

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

**Why.** The download folder has a random name and is always new, so no
other program can put a link at its path (plan 119). The app deletes
nothing in `%TEMP%` that it did not make in the same run.

**Instead.** Delete the `pdf-editor-update-*` folders in `%TEMP%`, or run
Windows Disk Cleanup or Storage Sense.

## Uninstall keeps data in linked or cloud folders

**What happens.** When a data folder, or a folder between it and
`%APPDATA%` / `%LOCALAPPDATA%`, is a junction, a symbolic link or a mount
point, the uninstaller deletes nothing in that part and shows a message
(exit code 3). A link inside a data folder, also a OneDrive placeholder
(files on demand), stays, and so does its folder. Paths longer than 260
characters are no problem.

**Why.** A link can point outside the app's folders. The uninstaller
never follows one, so it cannot delete files of other programs.

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
