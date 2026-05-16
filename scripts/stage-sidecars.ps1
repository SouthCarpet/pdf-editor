#Requires -Version 7
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ManifestPath = Join-Path $PSScriptRoot "sidecar-manifest.json"
$ProjectRoot  = Split-Path $PSScriptRoot -Parent
$Manifest     = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Resources    = Join-Path $ProjectRoot "src-tauri/resources"
$Staging      = Join-Path $ProjectRoot "src-tauri/sidecars"
$Suffix       = "-x86_64-pc-windows-msvc.exe"

# name → staged short-name (Tauri externalBin entries match this stem)
$StageNames = @{
    "qpdf"        = "qpdf"
    "ghostscript" = "gswin64c"
    "mupdf"       = "mutool"
    "tesseract"   = "tesseract"
    "pdfcrack"    = "pdfcrack"
}

New-Item -Path $Staging -ItemType Directory -Force | Out-Null

foreach ($prop in $Manifest.PSObject.Properties) {
    $name = $prop.Name
    $spec = $prop.Value
    if (-not $StageNames.ContainsKey($name)) { continue }       # tessdata + (future libreoffice) not staged here
    $shortName = $StageNames[$name]
    $extractDir = Join-Path $ProjectRoot $spec.extract_to
    $from = Join-Path $extractDir $spec.binary
    if (-not (Test-Path $from)) {
        Write-Warning "missing: $from (run scripts/fetch-sidecars.ps1 first)"
        continue
    }
    $to = Join-Path $Staging ($shortName + $Suffix)
    Copy-Item -Path $from -Destination $to -Force
    Write-Host "staged $shortName"

    # ghostscript and tesseract drag DLL siblings — copy them alongside the renamed .exe
    # so Windows DLL search finds them when the sidecar is spawned.
    $binaryDir = Split-Path -Parent $from
    if ($spec.PSObject.Properties.Name -contains "extra_files") {
        foreach ($rel in $spec.extra_files) {
            $src = Join-Path $extractDir $rel
            if (-not (Test-Path $src)) { Write-Warning "  missing extra: $src"; continue }
            Copy-Item -Path $src -Destination (Join-Path $Staging (Split-Path -Leaf $src)) -Force
            Write-Host "  + $(Split-Path -Leaf $src)"
        }
    }
    if ($spec.PSObject.Properties.Name -contains "extra_files_glob") {
        $matches = Get-ChildItem -Path $binaryDir -Filter $spec.extra_files_glob -File
        foreach ($f in $matches) {
            Copy-Item -Path $f.FullName -Destination (Join-Path $Staging $f.Name) -Force
        }
        Write-Host "  + $($matches.Count) files matching $($spec.extra_files_glob)"
    }
}
# LibreOffice: bundled separately via tauri.conf.json bundle.resources (not externalBin).
