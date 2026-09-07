#Requires -Version 7
<#
.SYNOPSIS
    Builds the directory shape the MSI installs, from the staged sidecars.

.DESCRIPTION
    W8 (plan 067). `sidecar_launch_gate_test::all_five_sidecars_launch_through_manager_from_installed_layout`
    resolves every sidecar through `PDF_EDITOR_INSTALL_DIR` (see
    `src-tauri/src/sidecars/manager.rs`, `resolve_binary` and `sidecar_dll_dir`),
    which means an UNSUFFIXED `<name>.exe` beside a `sidecars\` directory holding
    the DLLs. CI never had such a directory, so that test failed in the
    `sidecar-contract` job on every run. This script produces the
    administrative-extract stand-in the test's own doc comment allows.

    Run `scripts/fetch-sidecars.ps1` and `scripts/stage-sidecars.ps1` first: the
    inputs are the staged `src-tauri/sidecars/<name>-x86_64-pc-windows-msvc.exe`
    binaries and every `.dll` beside them.

.PARAMETER OutDir
    Where to build the layout. Created if missing; existing files are overwritten.

.EXAMPLE
    pwsh scripts/assemble-install-layout.ps1 -OutDir tmp-067/install-layout
    $env:PDF_EDITOR_INSTALL_DIR = (Resolve-Path tmp-067/install-layout).Path
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $OutDir
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Staging = Join-Path $ProjectRoot "src-tauri/sidecars"
$Suffix = "-x86_64-pc-windows-msvc.exe"

# The same five the launch gate probes. Named here rather than globbed so a
# half-staged directory fails instead of producing a layout with a hole in it.
$Sidecars = @("qpdf", "gswin64c", "mutool", "tesseract", "pdfcrack")

if (-not (Test-Path -LiteralPath $Staging)) {
    throw "staging directory $Staging does not exist; run scripts/fetch-sidecars.ps1 and scripts/stage-sidecars.ps1 first"
}

$missing = @()
foreach ($name in $Sidecars) {
    $from = Join-Path $Staging ($name + $Suffix)
    if (-not (Test-Path -LiteralPath $from)) { $missing += $from }
}
if ($missing.Count -gt 0) {
    throw ("cannot assemble an installed layout, {0} of {1} staged sidecars are missing:`n{2}`nRun scripts/fetch-sidecars.ps1 then scripts/stage-sidecars.ps1." -f `
            $missing.Count, $Sidecars.Count, ($missing -join "`n"))
}

$DllDir = Join-Path $OutDir "sidecars"
New-Item -ItemType Directory -Force -Path $OutDir, $DllDir | Out-Null

foreach ($name in $Sidecars) {
    $from = Join-Path $Staging ($name + $Suffix)
    # The installed layout uses the plain name; the staging suffix is a Tauri
    # externalBin convention that only exists before bundling.
    Copy-Item -LiteralPath $from -Destination (Join-Path $OutDir "$name.exe") -Force
}

# The DLLs are NOT colocated with the exes in a real install: `bundle.resources`
# lands them under `<install dir>\sidecars\`, and `SidecarManager` prepends that
# directory to the child PATH. Copying them next to the exes instead would let a
# missing-DLL delivery defect pass the gate.
$dlls = @(Get-ChildItem -LiteralPath $Staging -Filter *.dll -File)
foreach ($dll in $dlls) {
    Copy-Item -LiteralPath $dll.FullName -Destination (Join-Path $DllDir $dll.Name) -Force
}

Write-Host "[OK] installed layout at $OutDir : $($Sidecars.Count) exes, $($dlls.Count) DLLs under sidecars\"
