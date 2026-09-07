#Requires -Version 7
# Phase 18 Task 90d  -  fixture generator for sidecar contract tests.
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
$Gs = Join-Path $Sidecars "gswin64c-$Suffix"
$Soffice = Join-Path $ProjectRoot "src-tauri/resources/libreoffice/App/libreoffice/program/soffice.exe"

# 1. sample.pdf  -  single page from a tiny generated PNG
$png = Join-Path $env:TEMP "_seed.png"
# pwsh 7+ removed `-Encoding Byte`; use `WriteAllBytes` for raw byte output.
[System.IO.File]::WriteAllBytes($png, [byte[]]@(
    0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,
    0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
    0x00,0x00,0x00,0x10,0x00,0x00,0x00,0x10,
    0x08,0x06,0x00,0x00,0x00,0x1F,0xF3,0xFF,0x61
))
& $Mutool convert -F pdf -o (Join-Path $Pdfs "sample.pdf") $png

# 2. password-permission.pdf  -  owner-only password (Type A: permission lock).
#    AES-256 (V=5) covers the modern encryption path.
& $Qpdf --encrypt "" "owner" 256 -- (Join-Path $Pdfs "sample.pdf") (Join-Path $Pdfs "password-permission.pdf")

# 3. password-open.pdf  -  user password (Type B: open password). Uses
#    128-bit (V=4) encryption because pdfcrack 0.19 only supports V<=4
#    (V=5/V=6 AES-256 errors with "Standard - 6 not supported").
#    --allow-weak-crypto is required by qpdf 12.x to emit 128-bit files.
& $Qpdf --allow-weak-crypto --encrypt "user" "owner" 128 -- (Join-Path $Pdfs "sample.pdf") (Join-Path $Pdfs "password-open.pdf")

# 4. slovak-utf8.pdf  -  Slovak + Czech + German diacritics for UTF-8 round-trip.
#    W6 (plan 067): produced by the mutool sidecar, not LibreOffice. CI never
#    stages LibreOffice, so the seven tests that read this fixture failed in the
#    `sidecar-contract` job every run; and the HTML this step used to write had
#    itself lost its diacritics ("Priliz zltucky kon ..."), so even a machine
#    WITH LibreOffice produced a fixture that could not satisfy the suite's
#    EXPECTED_GRAPHEMES. See generate-slovak-fixture.js for the font choice.
& $Mutool run (Join-Path $PSScriptRoot "generate-slovak-fixture.js") (Join-Path $Pdfs "slovak-utf8.pdf")
if ($LASTEXITCODE -ne 0) { throw "generate-slovak-fixture.js failed (exit $LASTEXITCODE)" }

# 5. scanned.pdf  -  image-only PDF (no text layer; triggers OCR path).
#    F3 (plan 066): must carry real, OCR-recognizable Slovak text with
#    diacritics, not a blank placeholder - see generate-scanned-fixture.js
#    for the rendering approach and why it needs the Y-axis flip.
#    W3 (plan 067): its only input is the mutool sidecar, which this script
#    already requires and sidecar-manifest.json pins by sha256. The earlier
#    version read %WINDIR%\Fonts\arial.ttf, an unpinned system file that CI
#    neither vendors nor stages.
& $Mutool run (Join-Path $PSScriptRoot "generate-scanned-fixture.js") (Join-Path $Pdfs "scanned.pdf")
if ($LASTEXITCODE -ne 0) { throw "generate-scanned-fixture.js failed (exit $LASTEXITCODE)" }

# 6. large.pdf  -  50 copies of sample.pdf merged (perf bench input)
$tmpList = Join-Path $env:TEMP "_largefiles.txt"
1..50 | ForEach-Object { Join-Path $Pdfs "sample.pdf" } | Set-Content $tmpList
& $Qpdf --empty --pages "@$tmpList" -- (Join-Path $Pdfs "large.pdf")

# 7. sample.docx  -  small Word doc for soffice tests
if (Test-Path $Soffice) {
    $sampleTxt = Join-Path $Docs "sample.txt"
    "Test Slovak Smoke" | Set-Content $sampleTxt -Encoding UTF8
    & $Soffice --headless --convert-to docx --outdir $Docs $sampleTxt
}

# 8. word_test.png  -  Ghostscript-rendered PNG containing the literal text
#    "TEST" (OCR target). Explicit page size via setpagedevice avoids the
#    default Letter mapping; bold 60-pt Helvetica positioned mid-page so
#    Tesseract has a clean target.
$wordPng = Join-Path $Imgs "word_test.png"
$psFile = Join-Path $env:TEMP "_word_test.ps"
@"
%!PS-Adobe-3.0
<< /PageSize [200 100] >> setpagedevice
/Helvetica-Bold findfont 60 scalefont setfont
20 30 moveto
(TEST) show
showpage
"@ | Set-Content $psFile -Encoding ASCII
& $Gs -sDEVICE=png16m -r150 -dNOPAUSE -dBATCH -dQUIET "-sOutputFile=$wordPng" $psFile

Write-Host "[OK] fixtures generated under $Fixtures"
