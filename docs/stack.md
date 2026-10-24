# PDF Editor — Stack

Konkrétny zoznam jazykov, knižníc a nástrojov, ktoré táto aplikácia používa.
Všetky verzie sú "minimum required" — vyšsie patch verzie sú OK, major bumpy vyžadujú spec update.

## 1. Programovacie jazyky

| Jazyk | Verzia | Kde sa používa |
|---|---|---|
| **Rust** | 1.85+ (2021 edition) | Backend (Tauri core), PDF service layer, sidecar manager, persistence, pipeline executor |
| **TypeScript** | 5.6+ | Celý frontend (React aplikácia, stores, Tauri command wrappers) |
| **JavaScript** | ES2023 | Cieľ kompilácie z TS (Vite výstup) |
| **SQL** | SQLite 3.45+ dialekt | Migrácie, dotazy cez sqlx |
| **PowerShell** | 7+ | Build skripty (`fetch-sidecars.ps1`, `package.ps1`, `run-dev.ps1`) |
| **JSON** | RFC 8259 | Config súbory (`settings.json`, `*.pdf-pipeline`, `*.pdf-project`), i18n locale files |

**Cieľová platforma:** Windows 10/11 x64 (primárne), build infra pripravená na macOS / Linux (deferred testing).

## 2. Frontend stack

### 2.1 Core framework & build

| Knižnica | Verzia | Účel |
|---|---|---|
| `react` | 19.x | UI framework |
| `react-dom` | 19.x | DOM renderer |
| `typescript` | 5.6.x | Statická typizácia |
| `vite` | 6.x | Dev server + production bundling |
| `@vitejs/plugin-react` | 4.x | React plugin pre Vite (Fast Refresh, JSX transform) |
| `@tauri-apps/cli` | 2.x | Tauri CLI (dev, build) |
| `@tauri-apps/api` | 2.x | Frontend SDK pre Tauri IPC |

### 2.2 UI knižnice

| Knižnica | Verzia | Účel |
|---|---|---|
| `tailwindcss` | 4.x | Utility-first CSS |
| `@tailwindcss/vite` | 4.x | Vite plugin pre Tailwind v4 |
| `shadcn/ui` | latest | Komponentová knižnica nad Radix |
| `@radix-ui/react-*` | 1.x | Primitívy pod shadcn (dialog, dropdown, popover, atď.) |
| `lucide-react` | 0.4xx | Ikony |
| `class-variance-authority` | 0.7+ | Variant management |
| `clsx` + `tailwind-merge` | latest | Class merging utility |

### 2.3 State, routing, data

| Knižnica | Verzia | Účel |
|---|---|---|
| `zustand` | 5.x | Globálny state (4 stores: app/document/tools/jobs/recent/pipeline) |
| `@tanstack/react-router` | 1.x | Type-safe file-based routing |
| `@tanstack/react-query` | 5.x | Tauri command invocation s cache + retry |
| `react-i18next` | 15.x | i18n (sk/en) |
| `i18next` | 24.x | Core i18n engine |

### 2.4 PDF rendering & editing UI

| Knižnica | Verzia | Účel |
|---|---|---|
| `pdfjs-dist` | 4.x | PDF rendering pre viewer + thumbnails (read-only display) |
| `konva` | 10.x | Canvas overlay pre annotations / form fields / crop bounds |
| `react-konva` | 19.x | React bindings pre Konva (React 19 kompatibilný; minimum konva@10) |
| `@xyflow/react` | 12.x | Node-based pipeline editor (formerly react-flow) |
| `react-window` | 1.x | Virtualizácia thumbnails (1000+ stránkové PDFs) |
| `react-dnd` | 16.x | Drag-drop (Organize stránok, pipeline node manipulácia) |
| `react-dnd-html5-backend` | 16.x | Browser DnD backend |
| `react-error-boundary` | 4.x | Error boundaries per route |

### 2.5 Frontend dev / test

| Nástroj | Verzia | Účel |
|---|---|---|
| `vitest` | 2.x | Unit + component testy |
| `@testing-library/react` | 16.x | Component testing API |
| `@testing-library/user-event` | 14.x | Realistická user interakcia v testoch |
| `playwright` | 1.x | E2E testy v Tauri WebDriver móde |
| `eslint` | 9.x | Linting |
| `prettier` | 3.x | Formátovanie |
| `pnpm` | 9.x | Package manager (workspace root) |

## 3. Backend (Rust) stack

### 3.1 Core framework

| Crate | Verzia | Účel |
|---|---|---|
| `tauri` | 2.x | Desktop app framework |
| `tauri-build` | 2.x | Build-script integrácia |
| `tauri-plugin-fs` | 2.x | Filesystem plugin (allowlisted) |
| `tauri-plugin-dialog` | 2.x | File picker dialógy |
| `tauri-plugin-shell` | 2.x | Sidecar process spawn (`ShellExt::shell().sidecar()`); replaces `tauri-plugin-process`, ktorý v Tauri 2.x rieši iba app lifecycle |
| `wry` | 0.45+ | WebView (transient cez Tauri) |

### 3.2 Async, serialization, errors, logging

| Crate | Verzia | Účel |
|---|---|---|
| `tokio` | 1.4x | Async runtime (multi-thread) |
| `tokio-util` | 0.7+ | CancellationToken, codecs |
| `serde` | 1.0 | Serializácia |
| `serde_json` | 1.0 | JSON encoding |
| `thiserror` | 2.x | Typed error enums |
| `anyhow` | 1.0 | Internal error propagation |
| `tracing` | 0.1 | Structured logging |
| `tracing-subscriber` | 0.3 | Log file output, level filter |
| `tracing-appender` | 0.2 | Daily-rotated log files |
| `specta` | 2.x | Rust → TypeScript type generation core (`#[derive(Type)]`) |
| `specta-typescript` | 0.0.x | TypeScript exporter crate (oddelená od `specta` core od v2) |
| `tauri-specta` | 2.x | Tauri integrácia pre specta (Builder, `collect_commands!`, `collect_events!`) |

### 3.3 PDF / image processing (Rust crates)

| Crate | Verzia | Účel |
|---|---|---|
| `lopdf` | 0.34+ | Pure Rust PDF object model (merge, split, extract, organize, metadata edits) |
| `mupdf` (`mupdf-rs`) | 0.4+ | Bindings k libmupdf (rendering, text extraction, fast page-level ops) |
| `image` | 0.25+ | Image decoding/encoding (PNG, JPEG, TIFF, BMP) pre image→PDF a PDF→raster |
| `imageproc` | 0.25+ | Pixel-level diff (Compare Mode 1), bbox detection (Crop autodetect) |
| `tesseract` | 0.15+ | Bindings na libtesseract (OCR) |
| `similar` | 2.x | Myers diff algoritmus (Compare Mode 2) |
| `aes` | 0.8+ | AES decryption (unlock keď heslo známe; brute-force ide cez pdfcrack sidecar) |
| `cbc` | 0.1+ | CBC mode pre AES |
| `sha2` | 0.10+ | Hashe (verifikácia sidecar binárok pri build-e) |
| `rayon` | 1.10+ | Data-parallelism pre bulk operácie |

### 3.4 Persistence

| Crate | Verzia | Účel |
|---|---|---|
| `sqlx` | 0.8+ | SQLite klient s compile-time checked dotazmi (features: `runtime-tokio`, `sqlite`, `migrate`) |
| `directories` | 5.x | Cross-platform `%AppData%` resolution |

### 3.5 Rust dev / test

| Nástroj | Účel |
|---|---|
| `cargo` | Build / test / publish |
| `clippy` | Linting (CI-enforced) |
| `rustfmt` | Formátovanie (CI-enforced) |
| `cargo-nextest` | Rýchlejší test runner |
| `cargo-deny` | License + security audit |

## 4. Sidecar binárky (zabaľované do inštalátora)

Externé binárky spawn-ované Rust core-om na ťažké PDF operácie. Bundlované do per-user inštalátora (Inno Setup 6, `packaging/payload.json`) v rovnakom rozložení ako staré MSI cez `tauri.conf.json` `bundle.externalBin`.

| Binárka | Verzia | Licencia | Veľkosť | Použitie |
|---|---|---|---|---|
| **qpdf** (`qpdf.exe`) | 12.3.2+ | Apache 2.0 | ~3 MB | Unlock (Type A/B), linearize, structural ops, flatten annotations, object streams. 12.3.2 fixuje `--password` regression z 12.0–12.3.1 |
| **Ghostscript** (`gswin64c.exe` + libs) | 10.x | AGPL-3.0 | ~30 MB | Compress (3 presety), PDF/A creation (sekundárne, primárne LO) |
| **MuPDF tools** (`mutool.exe` + `libmupdf.dll`) | 1.24+ | AGPL-3.0 | ~15 MB | Companion k `mupdf-rs`. `mutool clean -gggg` = full GC + xref kompakcia + object/stream dedup (object-level cleanup). `-S` = font subsetting (EXPERIMENTAL — používať s opatrnosťou) |
| **LibreOffice** (`soffice.exe`), nie je zabalený (plán 119) | 24.x | MPL 2.0 | ~350 MB, inštaluje používateľ | Konverzia: DOCX/ODT/XLSX/PPTX/HTML/RTF/ePub ↔ PDF, PDF/A export. Aplikácia ho nájde v registri; inštalátor ponúkne inštaláciu cez winget (`docs/install-contract.md`) |
| **Tesseract OCR** (`tesseract.exe` + `tesseract.dll`) | 5.x | Apache 2.0 | ~30 MB | OCR (alternatíva k Rust `tesseract` crate; zabalené pre robustnosť) |
| **tessdata_best** (eng, slk, ces, deu) | latest | Apache 2.0 | ~200 MB | OCR jazykové modely (4 jazyky pre offline; user môže drag-drop ďalšie do `%AppData%\PdfEditor\tessdata-extra\`) |
| **pdfcrack** (`pdfcrack.exe`) | 0.20+ | GPL-2.0+ | ~1 MB | Brute-force unlock (Recovery mode, secondary, behind warning) |
| **WiX Toolset** | 4.x (build-only) | MS-RL | — | MSI installer creation (nezahrnuté do produktu, len v build chain) |

**Spolu sidecary: ~430 MB** (pred kompresiou MSI).

## 5. Build tooling

| Nástroj | Verzia | Účel |
|---|---|---|
| `cargo` | 1.85+ | Rust build |
| `pnpm` | 9.x | Node deps |
| `rustup` | latest | Rust toolchain manager |
| `node` | 20.19+ LTS | TypeScript / Vite runtime (Vite 6 minimum) |
| `tauri-cli` | 2.x | `tauri dev`, `tauri build` |
| Inno Setup | 6.x | Per-user inštalátor (`packaging/build-installer.ps1`, plán 119) |
| `wix` | 3.14 | Staré MSI (`pnpm tauri build`) |
| `pwsh` | 7+ | Build skripty (Windows-friendly) |

## 6. CI / linting / formátovanie

| Nástroj | Účel |
|---|---|
| `clippy` (Rust) | Lint, CI-enforced `-D warnings`. Complexity check: add `-D clippy::cognitive_complexity` (threshold 12 in `src-tauri/.clippy.toml`) |
| `rustfmt` (Rust) | Format, CI-enforced |
| `cargo-deny` (Rust) | License + advisory check |
| `eslint` + `@typescript-eslint` | Lint (TS/React) |
| `prettier` | Format (TS/JSON/CSS) |
| `tsc --noEmit` | Type-check v CI |
| `vitest run --coverage` | Coverage report |
| `cargo test` + `cargo nextest` | Rust testy |

## 7. Runtime requirements (cieľový stroj)

- **OS:** Windows 10 21H2+ alebo Windows 11
- **Architecture:** x64
- **WebView2 Runtime:** automaticky inštalované cez Edge na Win 11; Win 10: inštalátor ju po súhlase stiahne, ak chýba (~150 MB stiahnutia z MS pri install — len ak chýba)
- **Disk:** ~480 MB pre app + dáta v `%AppData%\PdfEditor\`
- **RAM:** 4 GB minimum, 8 GB odporúčané (OCR a veľké PDF benefity)
- **CPU:** ľubovoľný x64 z posledných 8 rokov; Tesseract a Ghostscript sú CPU-bound
- **Sieť:** **nepotrebná**. Aplikácia funguje 100% offline. Jediná požiadavka je voliteľná kontrola novej verzie na GitHube (predvolene vypnutá, plán 119)

## 8. Licencie zhrnutie

- **Naša app code:** AGPL-3.0 (kvôli AGPL sidecarom MuPDF + Ghostscript)
- **Bundlované sidecary:** každý so svojou licenciou (Apache 2.0, AGPL-3.0, MPL 2.0, GPL-2.0+, MS-RL)
- **THIRD_PARTY_LICENSES.md** v inštalátore obsahuje plný text + source URL každej zložky (AGPL §6 source-offer obligation)

## 9. Mimo scope (čo NEpoužívame)

Pre referenciu, čo sme zámerne **odmietli** a prečo:

- ❌ **Electron** — príliš veľký (~150 MB), pomalší štart ako Tauri
- ❌ **Python** v runtime — `ocrmypdf` reimplementujeme natívne v Rust (úspora ~40 MB embedded Python)
- ❌ **PaddleOCR / EasyOCR** — Tesseract má lepší OSS ekosystém + dostupnosť tessdata pre slk/ces
- ❌ **pdf-lib** vo frontende — všetko PDF spracovanie je v Rust core, nie v browseri
- ❌ **react-flow** (deprecated) — nahradené za `@xyflow/react` (maintained successor)
- ❌ **Redux** — Zustand je menej boilerplate pre tento usecase
- ❌ **Webpack** — Vite je rýchlejší, modernejší
- ❌ **CRA (Create React App)** — deprecated v 2023
- ❌ **fetch / axios / reqwest** v default mode — žiadne sieťové volania. Výnimka (plán 119): `reqwest` iba v `src-tauri/src/services/release_check.rs`, kontrola a stiahnutie aktualizácie po súhlase
- ❌ **GitHub Pages / cloud hosting** — localhost-only, žiadny server
- ❌ **LLM SDKs** (OpenAI, Anthropic, atď.) — žiadny LLM
- ❌ **Telemetria** (PostHog, Sentry, Mixpanel) — žiadne tracking
