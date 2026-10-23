#Requires -Version 7
<#
.SYNOPSIS
    Builds PDF Editor and packages it into the per-user Inno Setup 6 setup.

.DESCRIPTION
    1. Builds the frontend (tsc, then vite) and the release binary through
       tauri-cli with --no-bundle (no MSI), jobs 4. Skipped with -SkipBuild.
    2. Checks that the binary embeds the frontend bundle.
    3. Runs packaging\check-payload.mjs: the three manifest versions must
       agree, and every file of packaging\payload.json must exist and not be
       empty. It writes packaging\output\payload-files.iss.
    4. Compiles packaging\pdf-editor.iss with ISCC. ESET can read-lock a
       fresh setup EXE for 2 to 5 minutes, so the compile retries.
    5. Writes the setup's SHA-256 line to packaging\output\SHA256SUMS.txt.

    This script never runs the setup it builds.

.PARAMETER SkipBuild
    Reuse the existing release binary in src-tauri\target\release.

.EXAMPLE
    pwsh packaging\build-installer.ps1
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param([string]$What, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE" }
}

function Invoke-AppBuild {
    param([string]$RepoRoot)
    # node on the package scripts, not the .cmd shims: ESET can deny the
    # shims on this machine. tauri-cli sets the custom-protocol feature, so
    # the binary embeds dist\ instead of loading the dev URL. The override
    # empties beforeBuildCommand because dist\ is already built here.
    Push-Location $RepoRoot
    try {
        Invoke-Checked 'tsc' { node node_modules/typescript/bin/tsc -b }
        Invoke-Checked 'vite build' { node node_modules/vite/bin/vite.js build }
        $env:CARGO_BUILD_JOBS = '4'
        $override = Join-Path $RepoRoot 'packaging\tauri.build-override.json'
        Invoke-Checked 'tauri build' { node node_modules/@tauri-apps/cli/tauri.js build --no-bundle --config $override }
    } finally {
        Pop-Location
    }
}

function Assert-ReleaseFrontend {
    param([string]$RepoRoot, [string]$ExePath)
    if (-not (Test-Path -LiteralPath $ExePath)) { throw "Release binary not found at $ExePath" }
    $bundle = Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'dist\assets') -Filter 'index-*.js' |
        Select-Object -First 1
    if (-not $bundle) { throw 'dist\assets holds no index-*.js bundle. Build the frontend first.' }
    $name = [IO.Path]::GetFileNameWithoutExtension($bundle.Name)
    $exeText = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($ExePath))
    if (-not $exeText.Contains($name)) {
        throw "$ExePath does not embed the frontend bundle '$name'. Rebuild without -SkipBuild."
    }
    Write-Host "Frontend bundle '$name' found in the release binary."
}

function Find-InnoCompiler {
    $candidates = @(
        (Get-Command ISCC -ErrorAction SilentlyContinue)?.Source
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    $iscc = $candidates | Select-Object -First 1
    if (-not $iscc) { throw 'ISCC.exe (Inno Setup 6) not found. Install it: winget install JRSoftware.InnoSetup' }
    return $iscc
}

function Invoke-InnoCompilation {
    param([string]$Iscc, [string]$IssPath, $Report, [string]$SetupPath)
    $maxAttempts = 10
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        & $Iscc "/DAppVersion=$($Report.version)" "/DExeSha256=$($Report.exeSha256)" $IssPath
        if ($LASTEXITCODE -eq 0) { return }
        Write-Warning "ISCC attempt $attempt of $maxAttempts failed (exit $LASTEXITCODE). ESET can lock a fresh setup EXE; retrying in 30 s."
        # A half-written setup stays locked and blocks every retry; remove it.
        Remove-Item -LiteralPath $SetupPath -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 30
    }
    throw "ISCC failed after $maxAttempts attempts."
}

function Get-SetupHash {
    param([string]$SetupPath)
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        try {
            return (Get-FileHash -LiteralPath $SetupPath -Algorithm SHA256).Hash.ToLowerInvariant()
        } catch {
            Write-Warning "Hash attempt $attempt failed ($($_.Exception.Message)); retrying in 30 s."
            Start-Sleep -Seconds 30
        }
    }
    throw "Cannot read $SetupPath to hash it."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $PSScriptRoot 'output'
$exePath = Join-Path $repoRoot 'src-tauri\target\release\pdf-editor.exe'

if (-not $SkipBuild) { Invoke-AppBuild $repoRoot }
Assert-ReleaseFrontend $repoRoot $exePath

$reportJson = node (Join-Path $PSScriptRoot 'check-payload.mjs') $repoRoot $outputDir
if ($LASTEXITCODE -ne 0) { throw 'Payload or version check failed. No setup was compiled.' }
$report = $reportJson | ConvertFrom-Json
Write-Host "Payload check: $($report.files) files, version $($report.version)."

$setupPath = Join-Path $outputDir $report.setup
Invoke-InnoCompilation (Find-InnoCompiler) (Join-Path $PSScriptRoot 'pdf-editor.iss') $report $setupPath
if (-not (Test-Path -LiteralPath $setupPath)) { throw "Expected setup not found at $setupPath" }

$hash = Get-SetupHash $setupPath
$sumsLine = "$hash  $($report.setup)"
Set-Content -LiteralPath (Join-Path $outputDir 'SHA256SUMS.txt') -Value $sumsLine -Encoding ascii
Write-Host "Setup built: $setupPath"
Write-Host "SHA256SUMS.txt: $sumsLine"
