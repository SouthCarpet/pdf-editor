#Requires -Version 7
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Resources   = Join-Path $ProjectRoot "src-tauri/resources"
$Staging     = Join-Path $ProjectRoot "src-tauri/sidecars"
$Suffix      = "-x86_64-pc-windows-msvc.exe"

$pairs = @(
    @{ src = "qpdf/qpdf.exe";                              name = "qpdf" },
    @{ src = "ghostscript/gswin64c.exe";                   name = "gswin64c" },
    @{ src = "mupdf/mutool.exe";                           name = "mutool" },
    @{ src = "tesseract/tesseract.exe";                    name = "tesseract" },
    @{ src = "pdfcrack/pdfcrack.exe";                      name = "pdfcrack" }
)
New-Item -Path $Staging -ItemType Directory -Force | Out-Null
foreach ($p in $pairs) {
    $from = Join-Path $Resources $p.src
    $to   = Join-Path $Staging   ($p.name + $Suffix)
    if (-not (Test-Path $from)) { Write-Warning "missing: $from"; continue }
    Copy-Item -Path $from -Destination $to -Force
    Write-Host "staged $($p.name)"
}
# LibreOffice: too many files; we'll use bundle.resources for it (see Task 9).
