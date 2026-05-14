// Phase 18 Task 90c — cargo-fuzz harness for lopdf parsing.
//
// Goal: surface panics, infinite loops, or unbounded allocations in
// lopdf when fed arbitrary byte sequences. Run locally with:
//
//     cargo install cargo-fuzz
//     cd src-tauri
//     cargo +nightly fuzz run pdf_parse -- -max_total_time=300
//
// CI runs this weekly via .github/workflows/nightly.yml with a 4-hour
// budget. Crash inputs land in fuzz/artifacts/pdf_parse/ for regression
// coverage.

#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // We only care about the parser staying well-behaved on garbage
    // input; the result is intentionally discarded.
    let _ = lopdf::Document::load_mem(data);
});
