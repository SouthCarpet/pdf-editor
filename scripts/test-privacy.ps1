#Requires -Version 7
# Phase 18 Task 90f  -  privacy / network-isolation static check.
#
# Scans the release binary for symbols belonging to outbound HTTP / TCP
# crates. Any hit fails the build  -  the localhost-only promise is hard
# to walk back later.
#
# Run after `cargo build --release` (or as the `privacy` CI job).

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$bin = Join-Path $ProjectRoot "src-tauri/target/release/pdf-editor.exe"

if (-not (Test-Path $bin)) {
    Write-Error "Release binary not found at ${bin}; build first with 'cargo build --release --manifest-path src-tauri/Cargo.toml'"
    exit 2
}

$forbidden = @(
    "reqwest",
    "hyper::client",
    "tokio::net::TcpStream",
    "ureq",
    "isahc",
    "rustls"
)

# dumpbin is part of the MSVC toolchain (already required by this project).
$symbols = & dumpbin /symbols $bin 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "dumpbin failed; ensure MSVC build tools are on PATH"
    exit 2
}

$fail = $false
foreach ($needle in $forbidden) {
    if ($symbols -match $needle) {
        Write-Host "[FAIL] FORBIDDEN NETWORK SYMBOL FOUND: $needle"
        $fail = $true
    }
}

if ($fail) {
    Write-Error "Privacy check failed  -  outbound-network symbols present"
    exit 1
}

Write-Host "[OK] no outbound network-client symbols in $bin"
