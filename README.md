# PDF Editor

Localhost-only desktop application for handling PDF files. Windows 10/11 x64.

See `docs/superpowers/specs/2026-05-10-pdf-editor-design.md` for the full design.
See `docs/stack.md` for the tech stack.

## Build

```
pnpm install
cargo fetch
pwsh scripts/fetch-sidecars.ps1
pnpm tauri build
```
