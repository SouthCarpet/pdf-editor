#Requires -Version 7
# Phase 18 Task 90f - privacy / network-isolation check.
#
# Scans `src-tauri/Cargo.toml` direct dependencies for outbound-HTTP /
# auto-update crates. Any hit fails the build; the localhost-only promise
# is hard to walk back later.
#
# Why direct-deps and not Cargo.lock or dumpbin:
#   - Cargo.lock includes optional/transitive deps (e.g. tauri pulls in
#     reqwest behind the `updater` feature flag we do not enable),
#     producing false positives.
#   - dumpbin needs MSVC tools on PATH (not the default on
#     `windows-latest`) and only runs AFTER a 10-15 min release build.
#   - Anything our code SHIPS must be a direct dep of pdf-editor or
#     enabled via a tauri-plugin-* we add; scanning Cargo.toml catches
#     both surfaces.
#
# CI: runs as the `privacy` job. Locally: `pwsh scripts/test-privacy.ps1`.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$cargoToml = Join-Path $ProjectRoot "src-tauri/Cargo.toml"

if (-not (Test-Path $cargoToml)) {
    Write-Error "Cargo.toml not found at ${cargoToml}"
    exit 2
}

# Crate / plugin names whose presence would compromise the localhost-only
# promise. Each one either (a) is itself an outbound HTTP client or (b)
# enables the relevant tauri feature flags.
$forbidden = @(
    "reqwest",
    "ureq",
    "isahc",
    "surf",
    "awc",
    "tauri-plugin-updater",     # enables tauri's reqwest path
    "tauri-plugin-http",        # exposes outbound HTTP from JS
    "tauri-plugin-deep-link"    # not outbound, but registers URL schemes
)

# Read raw text so commented-out lines do NOT trigger. Strip line
# comments (`#` to end of line) before matching.
$lines = Get-Content $cargoToml | ForEach-Object {
    $idx = $_.IndexOf('#')
    if ($idx -ge 0) { $_.Substring(0, $idx) } else { $_ }
}
$stripped = ($lines -join "`n")

$fail = $false
foreach ($crate in $forbidden) {
    # Match start-of-line `<crate> =` or `"<crate>"` (features/array form).
    $pattern1 = "(?m)^${crate}\s*="
    $pattern2 = "`"${crate}`""
    if ($stripped -match $pattern1 -or $stripped -match $pattern2) {
        Write-Host "[FAIL] FORBIDDEN DEPENDENCY in src-tauri/Cargo.toml: ${crate}"
        $fail = $true
    }
}

if ($fail) {
    Write-Error "Privacy check failed: outbound-network or updater crate present as direct dep"
    exit 1
}

Write-Host "[OK] no outbound-network or updater crates in src-tauri/Cargo.toml direct deps"
