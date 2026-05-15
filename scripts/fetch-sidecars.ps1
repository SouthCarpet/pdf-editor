#Requires -Version 7
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ManifestPath = Join-Path $PSScriptRoot "sidecar-manifest.json"
$ProjectRoot  = Split-Path $PSScriptRoot -Parent
$Manifest     = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$DownloadCache = Join-Path $env:LOCALAPPDATA "PdfEditorBuildCache"
New-Item -Path $DownloadCache -ItemType Directory -Force | Out-Null

function Confirm-Hash {
    param([string]$Path, [string]$Expected)
    if ($Expected -eq "REPLACE_WITH_ACTUAL_HASH") {
        $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLower()
        Write-Warning "[$Path] no pinned hash - record this in sidecar-manifest.json: $actual"
        return $true
    }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLower()
    if ($actual -ne $Expected.ToLower()) {
        throw "Hash mismatch for ${Path}: expected $Expected, got $actual"
    }
    Write-Host "  [OK] hash verified"
    return $true
}

function Get-Sidecar {
    param([string]$Name, $Spec)
    Write-Host "==> $Name $($Spec.version)"
    $dest = Join-Path $ProjectRoot $Spec.extract_to
    $finalBinary = Join-Path $dest (Split-Path -Leaf $Spec.binary)
    if (Test-Path $finalBinary) { Write-Host "  [SKIP] already present"; return }

    $cacheFile = Join-Path $DownloadCache (Split-Path -Leaf $Spec.url)
    if (-not (Test-Path $cacheFile)) {
        Write-Host "  downloading..."
        Invoke-WebRequest -Uri $Spec.url -OutFile $cacheFile -UseBasicParsing
    }
    Confirm-Hash -Path $cacheFile -Expected $Spec.sha256

    New-Item -Path $dest -ItemType Directory -Force | Out-Null
    if ($cacheFile.EndsWith(".zip")) {
        Expand-Archive -Path $cacheFile -DestinationPath $dest -Force
    } else {
        Copy-Item -Path $cacheFile -Destination (Join-Path $dest (Split-Path -Leaf $Spec.binary))
    }
    Write-Host "  [OK] extracted to $dest"
}

function Get-Tessdata {
    param($Spec)
    Write-Host "==> tessdata ($($Spec.languages -join ', '))"
    $dest = Join-Path $ProjectRoot $Spec.extract_to
    New-Item -Path $dest -ItemType Directory -Force | Out-Null
    foreach ($lang in $Spec.languages) {
        $url  = $Spec.url_template -replace '{lang}', $lang
        $file = Join-Path $dest "$lang.traineddata"
        if (Test-Path $file) { Write-Host "  [SKIP] $lang"; continue }
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
