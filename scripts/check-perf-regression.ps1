#Requires -Version 7
# Phase 18 Task 90g  -  performance regression gate.
#
# Runs criterion benchmarks and compares median runtimes against
# `benches/baseline.json`. Fails CI on any > 20% regression. CI populates
# the baseline file from the last green main run; locally, devs can
# update it intentionally after a behavioral change by copying the
# `target/criterion/*/new/estimates.json` median values in.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$BaselineFile = Join-Path $ProjectRoot "benches/baseline.json"
$Threshold = 0.20  # 20% regression budget

if (-not (Test-Path $BaselineFile)) {
    Write-Host "[INFO] no baseline file at $BaselineFile  -  first run, nothing to compare"
    exit 0
}

Push-Location $ProjectRoot
try {
    cargo bench --manifest-path src-tauri/Cargo.toml --bench pdf_ops -- --output-format bencher | Tee-Object -FilePath current.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Error "cargo bench failed"
        exit 2
    }
} finally {
    Pop-Location
}

$baseline = Get-Content $BaselineFile | ConvertFrom-Json -AsHashtable
$current = @{}

# Parse `--output-format bencher` lines: `test <name> ... bench: <ns> ns/iter ...`
Get-Content (Join-Path $ProjectRoot "current.txt") | ForEach-Object {
    if ($_ -match "^test\s+(\S+)\s+\.\.\.\s+bench:\s+([\d,]+)\s+ns") {
        $name = $matches[1]
        $ns = [double]($matches[2] -replace ",", "")
        $current[$name] = $ns
    }
}

$failed = $false
foreach ($name in $baseline.Keys) {
    if (-not $current.ContainsKey($name)) {
        Write-Host "[WARN] benchmark '$name' missing in current run; skipping"
        continue
    }
    $prev = [double]$baseline[$name]
    $now  = [double]$current[$name]
    if ($prev -le 0) { continue }
    $regression = ($now - $prev) / $prev
    $pct = [math]::Round($regression * 100, 1)
    if ($regression -gt $Threshold) {
        Write-Host "[FAIL] PERF REGRESSION: $name +$pct% ($prev -> $now ns)"
        $failed = $true
    } else {
        Write-Host "[OK] $name $pct% ($prev -> $now ns)"
    }
}

if ($failed) {
    Write-Error "Performance regression beyond $($Threshold * 100)% threshold"
    exit 1
}
Write-Host "[OK] no regressions above $($Threshold * 100)% threshold"
