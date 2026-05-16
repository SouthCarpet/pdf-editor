#Requires -Version 7
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ManifestPath = Join-Path $PSScriptRoot "sidecar-manifest.json"
$ProjectRoot  = Split-Path $PSScriptRoot -Parent
$Manifest     = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$DownloadCache = Join-Path $env:LOCALAPPDATA "PdfEditorBuildCache"
New-Item -Path $DownloadCache -ItemType Directory -Force | Out-Null

$SevenZip = "$env:ProgramFiles\7-Zip\7z.exe"

function Confirm-Hash {
    param([string]$Path, [string]$Expected)
    $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLower()
    if ($Expected -eq "REPLACE_WITH_ACTUAL_HASH") {
        Write-Warning "[$Path] no pinned hash - record this in sidecar-manifest.json: $actual"
        return
    }
    if ($actual -ne $Expected.ToLower()) {
        throw "Hash mismatch for ${Path}: expected $Expected, got $actual"
    }
    Write-Host "  [OK] hash verified"
}

function Expand-Nsis {
    param([string]$Installer, [string]$Dest)
    if (-not (Test-Path $SevenZip)) {
        throw "7-Zip not found at $SevenZip; required to extract NSIS installers. Install 7-Zip or use a runner image that ships it (windows-latest does)."
    }
    & $SevenZip x -y -o"$Dest" $Installer | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7-Zip extraction failed for $Installer" }
}

function Test-NonEmpty {
    param([string]$Path)
    return (Test-Path $Path) -and ((Get-Item $Path).Length -gt 0)
}

function Get-Sidecar {
    param([string]$Name, $Spec)
    Write-Host "==> $Name $($Spec.version)"
    $dest = Join-Path $ProjectRoot $Spec.extract_to
    $finalBinary = Join-Path $dest $Spec.binary
    if (Test-NonEmpty $finalBinary) { Write-Host "  [SKIP] already present"; return }

    $cacheFile = Join-Path $DownloadCache (Split-Path -Leaf $Spec.url)
    if (-not (Test-NonEmpty $cacheFile)) {
        Write-Host "  downloading..."
        if (Test-Path $cacheFile) { Remove-Item $cacheFile -Force }
        Invoke-WebRequest -Uri $Spec.url -OutFile $cacheFile -UseBasicParsing
    }
    Confirm-Hash -Path $cacheFile -Expected $Spec.sha256

    New-Item -Path $dest -ItemType Directory -Force | Out-Null
    $format = if ($Spec.PSObject.Properties.Name -contains "format") { $Spec.format } else { "zip" }
    switch ($format) {
        "zip"    { Expand-Archive -Path $cacheFile -DestinationPath $dest -Force }
        "nsis"   { Expand-Nsis -Installer $cacheFile -Dest $dest }
        "binary" { Copy-Item -Path $cacheFile -Destination (Join-Path $dest (Split-Path -Leaf $Spec.binary)) }
        default  { throw "Unknown format '$format' for sidecar $Name" }
    }
    if (-not (Test-Path $finalBinary)) {
        throw "Extraction completed but expected binary missing: $finalBinary"
    }
    Write-Host "  [OK] $($Spec.binary)"
}

function Get-Tessdata {
    param($Spec)
    Write-Host "==> tessdata ($($Spec.languages -join ', '))"
    $dest = Join-Path $ProjectRoot $Spec.extract_to
    New-Item -Path $dest -ItemType Directory -Force | Out-Null
    foreach ($lang in $Spec.languages) {
        $url  = $Spec.url_template -replace '{lang}', $lang
        $file = Join-Path $dest "$lang.traineddata"
        if (Test-NonEmpty $file) { Write-Host "  [SKIP] $lang"; continue }
        if (Test-Path $file) { Remove-Item $file -Force }
        Write-Host "  downloading $lang..."
        Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing
    }
}

foreach ($prop in $Manifest.PSObject.Properties) {
    $name = $prop.Name
    $spec = $prop.Value
    if ($name -eq "tessdata") { Get-Tessdata -Spec $spec } else { Get-Sidecar -Name $name -Spec $spec }
}

Write-Host "`nAll sidecars present in src-tauri/resources/."
