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
