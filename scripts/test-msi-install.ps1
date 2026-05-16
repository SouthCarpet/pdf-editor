#Requires -Version 7
# Phase 18 Task 90l  -  MSI install smoke test (Windows Sandbox).
#
# Prerequisites:
#   - Windows 10/11 Pro or Enterprise edition.
#   - Windows Sandbox feature enabled (Settings > Apps > Optional features).
#   - The MSI built by `pnpm tauri build` available at
#     src-tauri/target/release/bundle/msi/PDF Editor_*_x64_en-US.msi.
#
# This script spins up a fresh Sandbox VM, copies the MSI in, installs
# it silently, launches the app once to verify the shell starts, then
# uninstalls and asserts %ProgramFiles%\PDF Editor\ is gone afterwards.
#
# CI: only runs on tag pushes (release.yml). Requires a Sandbox-enabled
# Windows runner image  -  the standard windows-latest image does NOT
# expose Sandbox by default; verify at runtime before depending on this.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$MsiDir = Join-Path $ProjectRoot "src-tauri/target/release/bundle/msi"

if (-not (Test-Path $MsiDir)) {
    Write-Error "MSI bundle directory not found at $MsiDir  -  run `pnpm tauri build` first"
    exit 2
}

$msi = Get-ChildItem $MsiDir -Filter "*.msi" | Select-Object -First 1
if (-not $msi) {
    Write-Error "No .msi file in $MsiDir"
    exit 2
}

Write-Host "[INFO] preparing Sandbox config for $($msi.FullName)"

$wsbDir = Join-Path $env:TEMP "pdf-editor-sandbox"
New-Item -ItemType Directory -Force -Path $wsbDir | Out-Null
Copy-Item -Path $msi.FullName -Destination $wsbDir -Force

$wsbCmd = Join-Path $wsbDir "install.cmd"
@"
@echo off
set MSI=C:\sandbox\$(Split-Path $msi.FullName -Leaf)
msiexec /i "%MSI%" /quiet /norestart /l*v C:\sandbox\install.log
if errorlevel 1 (
    echo INSTALL_FAILED %errorlevel% > C:\sandbox\result.txt
    exit /b 1
)
if not exist "%ProgramFiles%\PDF Editor\pdf-editor.exe" (
    echo APP_NOT_INSTALLED > C:\sandbox\result.txt
    exit /b 2
)
start "" "%ProgramFiles%\PDF Editor\pdf-editor.exe"
timeout /t 5 /nobreak >nul
taskkill /IM pdf-editor.exe /F >nul 2>&1
msiexec /x "%MSI%" /quiet /norestart /l*v C:\sandbox\uninstall.log
if exist "%ProgramFiles%\PDF Editor\" (
    echo UNINSTALL_LEFT_FILES > C:\sandbox\result.txt
    exit /b 3
)
echo OK > C:\sandbox\result.txt
"@ | Set-Content $wsbCmd -Encoding ASCII

$wsbFile = Join-Path $wsbDir "smoke.wsb"
@"
<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$wsbDir</HostFolder>
      <SandboxFolder>C:\sandbox</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>cmd.exe /c C:\sandbox\install.cmd</Command>
  </LogonCommand>
  <Networking>Disable</Networking>
</Configuration>
"@ | Set-Content $wsbFile -Encoding UTF8

Write-Host "[INFO] launching Sandbox: $wsbFile"
if (-not (Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue)) {
    Write-Error "Windows Sandbox not installed  -  enable it via Optional Features"
    exit 2
}

Start-Process -FilePath WindowsSandbox.exe -ArgumentList $wsbFile -Wait

$resultPath = Join-Path $wsbDir "result.txt"
if (-not (Test-Path $resultPath)) {
    Write-Error "Sandbox did not produce a result.txt  -  install likely never ran"
    exit 1
}

$result = (Get-Content $resultPath).Trim()
if ($result -ne "OK") {
    Write-Error "Install smoke failed: $result"
    exit 1
}

Write-Host "[OK] MSI install smoke passed"
