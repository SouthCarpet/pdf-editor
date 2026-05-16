#Requires -Version 7
# Phase 18 Task 90d — fixture generator for sidecar contract tests.
#
# Produces deterministic PDF + image + docx fixtures under
# src-tauri/tests/fixtures/ from the bundled sidecars (already staged
# via scripts/fetch-sidecars.ps1 + stage-sidecars.ps1).
#
# Locally: run once after fetch + stage. CI: runs in the
# `sidecar-contract` job before `cargo test --features sidecar-tests`.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Sidecars = Join-Path $ProjectRoot "src-tauri/sidecars"
$Fixtures = Join-Path $ProjectRoot "src-tauri/tests/fixtures"
$Pdfs = Join-Path $Fixtures "pdfs"
$Docs = Join-Path $Fixtures "docs"
$Imgs = Join-Path $Fixtures "images"
New-Item -ItemType Directory -Force $Pdfs, $Docs, $Imgs | Out-Null

$Suffix = "x86_64-pc-windows-msvc.exe"
$Mutool = Join-Path $Sidecars "mutool-$Suffix"
$Qpdf = Join-Path $Sidecars "qpdf-$Suffix"
$Soffice = Join-Path $ProjectRoot "src-tauri/resources/libreoffice/App/libreoffice/program/soffice.exe"

# 1. sample.pdf — single page from a tiny generated PNG
$png = Join-Path $env:TEMP "_seed.png"
# pwsh 7+ removed `-Encoding Byte`; use `WriteAllBytes` for raw byte output.
[System.IO.File]::WriteAllBytes($png, [byte[]]@(
    0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,
    0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
    0x00,0x00,0x00,0x10,0x00,0x00,0x00,0x10,
    0x08,0x06,0x00,0x00,0x00,0x1F,0xF3,0xFF,0x61
))
& $Mutool convert -F pdf -o (Join-Path $Pdfs "sample.pdf") $png

# 2. password-permission.pdf — owner-only password (Type A: permission lock)
& $Qpdf --encrypt "" "owner" 256 -- (Join-Path $Pdfs "sample.pdf") (Join-Path $Pdfs "password-permission.pdf")

# 3. password-open.pdf — user password (Type B: open password)
& $Qpdf --encrypt "user" "owner" 256 -- (Join-Path $Pdfs "sample.pdf") (Join-Path $Pdfs "password-open.pdf")

# 4. slovak-utf8.pdf — Slovak + Czech + German diacritics for UTF-8 round-trip
$html = Join-Path $env:TEMP "_slovak.html"
@"
<!doctype html><html><body>
<p>Priliz zltucky kon upal dabelske ody.</p>
<p>Slovak: Priliz zltucky kon upal dabelske ody.</p>
<p>Czech: Prilis zlutoucky kun upel dabelske ody.</p>
<p>German: Falsches Uben von Xylophonmusik qualt jeden grosseren Zwerg.</p>
</body></html>
"@ | Set-Content $html -Encoding UTF8

if (Test-Path $Soffice) {
    & $Soffice --headless --convert-to pdf --outdir $Pdfs $html
    if (Test-Path (Join-Path $Pdfs "_slovak.pdf")) {
        Move-Item -Force (Join-Path $Pdfs "_slovak.pdf") (Join-Path $Pdfs "slovak-utf8.pdf")
    }
}

# 5. scanned.pdf — image-only PDF (no text layer; triggers OCR path)
& $Mutool convert -F pdf -o (Join-Path $Pdfs "scanned.pdf") $png

# 6. large.pdf — 50 copies of sample.pdf merged (perf bench input)
$tmpList = Join-Path $env:TEMP "_largefiles.txt"
1..50 | ForEach-Object { Join-Path $Pdfs "sample.pdf" } | Set-Content $tmpList
& $Qpdf --empty --pages "@$tmpList" -- (Join-Path $Pdfs "large.pdf")

# 7. sample.docx — small Word doc for soffice tests
if (Test-Path $Soffice) {
    $sampleTxt = Join-Path $Docs "sample.txt"
    "Test Slovak Smoke" | Set-Content $sampleTxt -Encoding UTF8
    & $Soffice --headless --convert-to docx --outdir $Docs $sampleTxt
}

# 8. word_test.png — placeholder image. Tesseract test only runs when
# this fixture is present + OCR-readable; without an image-magick step we
# leave a 1x1 white PNG so the path resolves cleanly (the test asserts
# "TEST" in the output and will fail loudly when it should pass — that's
# the intended behavior until we wire up image generation here).
$wordPng = Join-Path $Imgs "word_test.png"
if (-not (Test-Path $wordPng)) {
    Copy-Item $png $wordPng
}

Write-Host "[OK] fixtures generated under $Fixtures"
