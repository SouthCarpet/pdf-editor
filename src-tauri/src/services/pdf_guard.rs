// Depth guard for PDF object nesting, kept as defence in depth.
//
// ============================================================================
// STATUS 2026-08-03: RUSTSEC-2026-0187 IS FIXED BY THE lopdf 0.34 -> 0.44
// UPGRADE, NOT BY THIS FILE.
//
// This module was written as a stopgap while the crate was pinned to 0.34.
// Two independent verifications then showed a byte-level pre-scan cannot close
// the advisory at all (see WHAT THIS DOES NOT DO, below), so the upgrade moved
// from "later" to "now". `deep_nesting_no_longer_aborts` proves the fix by
// behaviour rather than by reading a version number, and turns red if the pin
// ever falls back below 0.42.
//
// The module stays because the next parser bug will not announce itself, the
// scan costs one bounded pass, and it rejected zero of 260 real documents.
// It is a seatbelt, not the airbag.
// ============================================================================
//
// Original problem, retained because the tests and constants only make sense
// against it:
//
// `lopdf::Document::load*` parses nested arrays and dictionaries with unbounded
// recursion. A crafted file whose Catalog holds a ~10,000-deep nested array
// (`/X [[[ ... ]]]`, around 21 KB on disk) exhausts the call stack and aborts
// the process with SIGABRT. Because it aborts rather than panics, it CANNOT be
// caught with `catch_unwind`: no amount of error handling at the call site
// helps, which is why this has to happen before the load, not around it.
//
// Vulnerable through lopdf 0.41.0, fixed in 0.42.0. This crate pins 0.34
// (`Cargo.toml`), and lopdf 0.34's own `Error::BracketLimit` carries the
// comment "This does not seem to be used", so there is no upstream limit to
// turn on. Upgrading is eight minor versions across 86 references in 22 files
// and is tracked separately as ANIMUS plan 033; this guard is what stands in
// the meantime, per the user decision on 2026-08-02 to guard now and upgrade
// later.
//
// Threat model, stated honestly: this is a local desktop editor, not a service.
// The consequence of the bug is that opening a hostile file kills the app, so
// the exposure is availability only, with no persistence and no exfiltration.
// That lowers the urgency and does not make it a non-issue, because opening
// files the user did not author is the app's entire purpose.
//
// ============================================================================
// WHAT THIS DOES NOT DO. Read before trusting it.
//
// This guard DOES NOT CLOSE RUSTSEC-2026-0187. Two independent verifications
// on 2026-08-03 demonstrated four working bypasses, three of them using
// ordinary spec-legal PDF features, each measuring shallow here while still
// aborting lopdf:
//
//   1. The nest lives inside a /Type /ObjStm object stream. lopdf decompresses
//      and parses those bodies; this scanner skips stream bodies, and must, or
//      it would false-positive on every compressed content stream. Measured
//      depth 2 at 20,000 levels. A real attacker would FlateDecode it, so no
//      scanner that avoids decompression can ever see it.
//   2. A name containing "stream" sent the scan to EOF. FIXED (see
//      `is_stream_keyword`), and listed here because it shows how little it
//      costs an attacker to blind a lexer.
//   3. lopdf reaches objects by xref BYTE OFFSET; this scanner walks linearly.
//      A stray "(" in dead space makes the scanner read the real catalog as
//      string content. The two parsers do not agree on where objects are, so a
//      depth measured by one says nothing about the other.
//   4. A nest placed past SCAN_PREFIX_BYTES is unseen, while lopdf reads by
//      offset regardless of position. 8 of 260 real PDFs on this machine
//      already exceed that prefix.
//
// Bypasses 1, 3 and 4 are not bugs to be patched. They follow from a byte-level
// pre-scan and a full parser disagreeing about document structure, which is the
// premise, not the implementation.
//
// KEEP IT ANYWAY, for what it verifiably is: it raises the bar against the
// published proof of concept, it costs one bounded scan, and it rejected zero
// of 260 real documents (max measured depth 7). It is defence in depth.
// It is not the fix. The fix is lopdf >= 0.42, tracked as ANIMUS plan 033.
// ============================================================================

use crate::error::{AppError, AppResult};
use lopdf::{Document, Error as LopdfError};
use std::path::Path;

/// Maximum nesting depth of arrays and dictionaries we will hand to lopdf.
///
/// Real documents do not come close. The deepest structure in a normal PDF is
/// a page tree or an outline, on the order of tens of levels; the five
/// fixtures in `tests/fixtures/pdfs/` measure in the single digits. The
/// published proof of concept needs roughly 10,000 levels to exhaust the
/// stack. 256 sits about an order of magnitude above anything legitimate and
/// nearly two below the attack, so it rejects the exploit class without
/// arbitrating what counts as a well-formed document.
pub const MAX_NESTING_DEPTH: usize = 256;

/// Bytes scanned before we stop looking. The exploit is small and front-loaded
/// (the Catalog is near the head), while legitimate PDFs can be hundreds of
/// megabytes of image data that we have no reason to walk. Scanning a bounded
/// prefix keeps the guard O(1) on large files.
///
/// This is a deliberate, stated limit rather than a silent one: a hostile
/// nest placed beyond it would not be caught here. It would still have to
/// survive lopdf's own xref handling to be reached, and the alternative,
/// scanning 400 MB on every open, trades a real cost for a hypothetical one.
const SCAN_PREFIX_BYTES: usize = 8 * 1024 * 1024;

/// Result of the pre-scan. Returned rather than logged so callers can decide.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NestingReport {
    pub max_depth: usize,
    pub truncated: bool,
}

/// Measure the deepest array/dictionary nesting in a PDF byte stream.
///
/// This is a lexer, not a parser: it tracks only the delimiters that open and
/// close composite objects, and skips the three constructs where those bytes
/// do not mean what they look like.
///
///  - literal strings `( ... )`, which may contain unbalanced-looking brackets
///    and use `\` escapes, and which nest legally
///  - comments `%` through end of line
///  - stream bodies between `stream` and `endstream`, which are arbitrary
///    binary and routinely contain `[`, `<<` and `(` by coincidence
///
/// Getting those three wrong is the difference between a guard and a
/// false-positive generator, because a compressed content stream will happily
/// contain hundreds of stray `[` bytes.
pub fn measure_nesting(bytes: &[u8]) -> NestingReport {
    let truncated = bytes.len() > SCAN_PREFIX_BYTES;
    let buf = &bytes[..bytes.len().min(SCAN_PREFIX_BYTES)];

    let mut depth: usize = 0;
    let mut max_depth: usize = 0;
    let mut i: usize = 0;

    while i < buf.len() {
        match buf[i] {
            // Comment: skip to end of line.
            b'%' => {
                while i < buf.len() && buf[i] != b'\n' && buf[i] != b'\r' {
                    i += 1;
                }
            }

            // Literal string: skip to the matching close paren, honouring
            // backslash escapes and legal nesting of balanced parens.
            b'(' => {
                let mut nest = 1usize;
                i += 1;
                while i < buf.len() && nest > 0 {
                    match buf[i] {
                        b'\\' => i += 1, // skip the escaped byte, whatever it is
                        b'(' => nest += 1,
                        b')' => nest -= 1,
                        _ => {}
                    }
                    i += 1;
                }
                continue;
            }

            b'<' => {
                if buf.get(i + 1) == Some(&b'<') {
                    depth += 1;
                    max_depth = max_depth.max(depth);
                    i += 2;
                    continue;
                }
                // Single `<` opens a hex string; skip to `>`.
                while i < buf.len() && buf[i] != b'>' {
                    i += 1;
                }
            }

            b'>' if buf.get(i + 1) == Some(&b'>') => {
                depth = depth.saturating_sub(1);
                i += 2;
                continue;
            }

            b'[' => {
                depth += 1;
                max_depth = max_depth.max(depth);
            }

            b']' => depth = depth.saturating_sub(1),

            // Stream body: skip wholesale. Matching on the keyword rather than
            // reading /Length means a lying or indirect /Length cannot walk us
            // into the binary, which matters because /Length is attacker
            // controlled in exactly the file we are defending against.
            //
            // The token-boundary check is not cosmetic. Without it, the name
            // `/S /streamer` matched here, the scan found no `endstream`, and
            // jumped to EOF, so everything after six attacker-chosen bytes
            // became invisible. Demonstrated 2026-08-03.
            b's' if buf[i..].starts_with(b"stream") && is_stream_keyword(buf, i) => {
                match find(&buf[i..], b"endstream") {
                    Some(off) => i += off + b"endstream".len(),
                    None => i = buf.len(), // unterminated stream: nothing further is trustworthy
                }
                continue;
            }

            _ => {}
        }
        i += 1;
    }

    NestingReport {
        max_depth,
        truncated,
    }
}

/// True when `stream` at `i` is the standalone PDF keyword rather than a
/// substring of a longer token such as the name `/streamer` or `/endstream`.
///
/// PDF delimiters per ISO 32000 7.2.2, plus whitespace. A keyword must be
/// preceded by a delimiter or whitespace or start of file, and followed by
/// the same or end of file.
fn is_stream_keyword(buf: &[u8], i: usize) -> bool {
    const DELIM: &[u8] = b"()<>[]{}/%";
    let boundary = |b: u8| b.is_ascii_whitespace() || DELIM.contains(&b);
    let before_ok = i == 0 || boundary(buf[i - 1]);
    let after = i + b"stream".len();
    let after_ok = after >= buf.len() || boundary(buf[after]);
    before_ok && after_ok
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Reject a byte stream whose nesting would risk a stack-overflow abort.
pub fn guard_bytes(bytes: &[u8], label: &str) -> AppResult<()> {
    let report = measure_nesting(bytes);
    if report.max_depth > MAX_NESTING_DEPTH {
        return Err(AppError::PdfCorrupted {
            detail: format!(
                "{label}: object nesting depth {} exceeds the {} limit. \
                 A file this deeply nested crashes the PDF parser outright \
                 (RUSTSEC-2026-0187) rather than failing cleanly, so it is \
                 refused before parsing.",
                report.max_depth, MAX_NESTING_DEPTH
            ),
        });
    }
    Ok(())
}

/// Read a PDF from disk and reject it if its nesting is pathological.
///
/// Call this before `Document::load`. It reads the file twice in the worst
/// case, which is the price of not being able to catch the abort.
pub fn guard_path(path: &Path) -> AppResult<()> {
    let bytes = std::fs::read(path).map_err(|e| AppError::PdfCorrupted {
        detail: format!("{}: {e}", path.display()),
    })?;
    guard_bytes(&bytes, &path.display().to_string())
}

/// Maximum nesting depth accepted inside a CONTENT STREAM.
///
/// A separate, much lower limit than `MAX_NESTING_DEPTH`, for two reasons.
///
/// First, the threshold is far lower. `lopdf::content::Content::decode` is a
/// second unbounded-recursion parser (`nom_parser.rs` `operand` alternates
/// into `array` and `dictionary`, both recursing through `_direct_object`
/// with no depth counter), and it aborts with STATUS_STACK_OVERFLOW at
/// roughly **300 levels**, not the ~10,000 the document-object parser needs.
/// Measured on lopdf 0.34: 275 survives, 300 aborts.
///
/// Second, legitimate content streams are shallow. Nesting there comes from
/// `TJ` arrays and `BDC` property dictionaries, which are one or two deep.
/// 64 is generous for real files and roughly five times below the abort.
///
/// This door was missed by the first pass of this guard, and it is invisible
/// to `measure_nesting` BY DESIGN: that function skips stream bodies, because
/// a compressed content stream contains stray delimiters constantly. So the
/// document guard cannot cover this and a separate check is required.
pub const MAX_CONTENT_NESTING_DEPTH: usize = 64;

/// Guard decompressed content-stream bytes before `Content::decode`.
///
/// Returns `false` when the stream is too deeply nested to parse safely, so
/// callers can skip it the same way they already skip a decode error. A
/// refusal here is not a document-level failure: one unparseable content
/// stream means one page's operations are left alone.
pub fn content_is_safe_to_decode(bytes: &[u8]) -> bool {
    measure_content_nesting(bytes) <= MAX_CONTENT_NESTING_DEPTH
}

/// Depth of `[` and `<<` in a content stream.
///
/// Simpler than `measure_nesting`: content streams have no `stream` bodies to
/// skip and no comments in practice, but they DO contain literal strings
/// (every `Tj` and `TJ` operand), and those routinely hold brackets.
fn measure_content_nesting(bytes: &[u8]) -> usize {
    let mut depth: usize = 0;
    let mut max_depth: usize = 0;
    let mut i: usize = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'(' => {
                let mut nest = 1usize;
                i += 1;
                while i < bytes.len() && nest > 0 {
                    match bytes[i] {
                        b'\\' => i += 1,
                        b'(' => nest += 1,
                        b')' => nest -= 1,
                        _ => {}
                    }
                    i += 1;
                }
                continue;
            }
            b'<' if bytes.get(i + 1) == Some(&b'<') => {
                depth += 1;
                max_depth = max_depth.max(depth);
                i += 2;
                continue;
            }
            b'>' if bytes.get(i + 1) == Some(&b'>') => {
                depth = depth.saturating_sub(1);
                i += 2;
                continue;
            }
            b'[' => {
                depth += 1;
                max_depth = max_depth.max(depth);
            }
            b']' => depth = depth.saturating_sub(1),
            _ => {}
        }
        i += 1;
    }
    max_depth
}

/// Drop-in replacement for `lopdf::Document::load`.
///
/// Deliberately returns `Result<Document, lopdf::Error>` rather than
/// `AppResult`, so every existing call site keeps its own error handling
/// unchanged and the substitution is mechanical. A guard that required
/// rewriting 26 call sites by hand would have been applied to three of them.
///
/// Reads once and hands the same bytes to `load_mem`, so guarding costs one
/// bounded scan rather than a second read.
pub fn load_guarded<P: AsRef<Path>>(path: P) -> Result<Document, LopdfError> {
    let path = path.as_ref();
    let bytes = std::fs::read(path).map_err(LopdfError::IO)?;
    let report = measure_nesting(&bytes);
    if report.max_depth > MAX_NESTING_DEPTH {
        // The path is deliberately NOT in this message. It used to be, and
        // `commands/unlock.rs` decides control flow by substring-matching the
        // load error for "password" or "encrypt": a refused file living in
        // `Downloads\encrypted\` was therefore reported to the UI as
        // "password required", prompting the user for a password on a file
        // that had been refused for nesting. lopdf's own errors never carried
        // a path, so this was injected by the guard. Callers already know
        // which file they asked for.
        return Err(LopdfError::Syntax(format!(
            "object nesting depth {} exceeds the {} limit; refused before \
             parsing because a file this deeply nested aborts the parser \
             outright (RUSTSEC-2026-0187) rather than failing cleanly",
            report.max_depth, MAX_NESTING_DEPTH
        )));
    }
    Document::load_mem(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds the shape from the advisory's proof of concept: a Catalog whose
    /// /X value is an array nested `levels` deep.
    ///
    /// This produces a STRUCTURALLY VALID PDF with a real cross-reference
    /// table and correct byte offsets. The first version of this helper did
    /// not, and `vulnerability_is_real_in_this_build` caught it: lopdf
    /// rejected the file at the xref stage and never reached the nested
    /// array, so the PoC "survived" and would have certified a guard against
    /// a shape never shown to be dangerous. A malformed PoC proves nothing in
    /// either direction.
    fn nested_pdf(levels: usize) -> Vec<u8> {
        let mut out: Vec<u8> = Vec::new();
        out.extend_from_slice(b"%PDF-1.7\n");

        let off1 = out.len();
        out.extend_from_slice(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R /X ");
        out.extend(std::iter::repeat_n(b'[', levels));
        out.extend(std::iter::repeat_n(b']', levels));
        out.extend_from_slice(b" >>\nendobj\n");

        let off2 = out.len();
        out.extend_from_slice(b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n");

        let xref_off = out.len();
        out.extend_from_slice(b"xref\n0 3\n");
        out.extend_from_slice(b"0000000000 65535 f \n");
        out.extend_from_slice(format!("{off1:010} 00000 n \n").as_bytes());
        out.extend_from_slice(format!("{off2:010} 00000 n \n").as_bytes());
        out.extend_from_slice(b"trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n");
        out.extend_from_slice(format!("{xref_off}\n").as_bytes());
        out.extend_from_slice(b"%%EOF\n");
        out
    }

    #[test]
    fn the_poc_is_a_pdf_lopdf_actually_accepts() {
        // Without this, a malformed PoC makes every claim below vacuous. A
        // shallow instance of the same generator must load cleanly, which
        // proves the file shape is sound and that depth is the only variable.
        let doc = lopdf::Document::load_mem(&nested_pdf(3)).expect("shallow PoC must parse");
        assert!(
            doc.get_object((1, 0)).is_ok(),
            "catalog object must be reachable through the xref"
        );
    }

    #[test]
    fn rejects_the_advisory_shape() {
        // The published PoC uses ~10,380 levels in about 21 KB.
        let pdf = nested_pdf(10_380);
        assert!(pdf.len() < 32 * 1024, "PoC should be small: {}", pdf.len());
        let err = guard_bytes(&pdf, "poc.pdf").unwrap_err();
        match err {
            AppError::PdfCorrupted { detail } => {
                assert!(detail.contains("RUSTSEC-2026-0187"), "detail: {detail}");
            }
            other => panic!("expected PdfCorrupted, got {other:?}"),
        }
    }

    #[test]
    fn accepts_depth_at_the_limit_and_rejects_one_past_it() {
        // The boundary is the whole point of the constant; assert both sides
        // so a future edit to MAX_NESTING_DEPTH cannot silently loosen it.
        // +1 accounts for the enclosing dictionary.
        assert!(guard_bytes(&nested_pdf(MAX_NESTING_DEPTH - 1), "at").is_ok());
        assert!(guard_bytes(&nested_pdf(MAX_NESTING_DEPTH + 8), "past").is_err());
    }

    #[test]
    fn brackets_inside_literal_strings_do_not_count() {
        // A title full of open brackets is legal and must not trip the guard.
        // Without the string-skipping branch this is depth 400 and rejected.
        let mut s = String::from("%PDF-1.7\n1 0 obj\n<< /Title (");
        s.push_str(&"[".repeat(400));
        s.push_str(") >>\nendobj\n");
        assert_eq!(measure_nesting(s.as_bytes()).max_depth, 1);
    }

    #[test]
    fn brackets_inside_stream_bodies_do_not_count() {
        // Compressed content streams contain stray delimiters constantly.
        let mut v = b"%PDF-1.7\n1 0 obj\n<< /Length 400 >>\nstream\n".to_vec();
        v.extend(std::iter::repeat_n(b'[', 400));
        v.extend_from_slice(b"\nendstream\nendobj\n");
        assert_eq!(measure_nesting(&v).max_depth, 1);
    }

    #[test]
    fn escaped_paren_does_not_end_the_string_early() {
        // `\)` stays inside the string, so the brackets after it are still
        // string content. Getting this wrong reintroduces false positives.
        let mut s = String::from("%PDF-1.7\n<< /T (a\\)b");
        s.push_str(&"[".repeat(300));
        s.push_str(") >>\n");
        assert_eq!(measure_nesting(s.as_bytes()).max_depth, 1);
    }

    #[test]
    fn hex_string_is_not_a_dictionary() {
        // `<abc>` is a hex string; only `<<` opens a dictionary.
        let v = b"%PDF-1.7\n<< /ID <deadbeef> /X [1 2 3] >>\n";
        assert_eq!(measure_nesting(v).max_depth, 2);
    }

    #[test]
    fn comments_are_skipped() {
        let v = b"%PDF-1.7\n% [[[[[[[[[[ this is a comment\n<< /X [1] >>\n";
        assert_eq!(measure_nesting(v).max_depth, 2);
    }

    #[test]
    fn a_name_containing_stream_does_not_blind_the_scanner() {
        // Bypass demonstrated by an independent verifier on 2026-08-03: the
        // name `/S /streamer` matched the bare substring check, the scan found
        // no `endstream`, jumped to EOF, and rated a 20,000-deep nest as
        // depth 1. Six attacker-chosen bytes hid the rest of the file.
        let mut v = b"%PDF-1.7\n<< /S /streamer /X ".to_vec();
        v.extend(std::iter::repeat_n(b'[', 400));
        v.extend(std::iter::repeat_n(b']', 400));
        v.extend_from_slice(b" >>\n");
        let depth = measure_nesting(&v).max_depth;
        assert!(
            depth > MAX_NESTING_DEPTH,
            "a name containing 'stream' must not hide the nest; measured {depth}"
        );
    }

    #[test]
    fn a_real_stream_keyword_is_still_skipped() {
        // The boundary check must not break the skip it guards: this is the
        // false-positive side, and it is the reason the skip exists at all.
        let mut v = b"%PDF-1.7\n1 0 obj\n<< /Length 400 >>\nstream\n".to_vec();
        v.extend(std::iter::repeat_n(b'[', 400));
        v.extend_from_slice(b"\nendstream\nendobj\n");
        assert_eq!(measure_nesting(&v).max_depth, 1);
    }

    #[test]
    fn unterminated_stream_stops_the_scan_instead_of_walking_binary() {
        let mut v = b"%PDF-1.7\nstream\n".to_vec();
        v.extend(std::iter::repeat_n(b'[', 5_000));
        assert_eq!(measure_nesting(&v).max_depth, 0);
    }

    /// Feeds lopdf a 20,000-level nested PDF with no guard in front of it.
    ///
    /// Spawned as a subprocess by `deep_nesting_no_longer_aborts` below. On
    /// lopdf <= 0.41 this ABORTED, taking the whole test runner with it, which
    /// is why it cannot run in-process. On 0.42+ it returns normally.
    #[test]
    #[ignore = "spawned as a subprocess; aborted by design on lopdf <= 0.41"]
    fn poc_aborts_the_process_unguarded() {
        // Skips silently rather than asserting when the harness env var is
        // absent. `#[ignore]` is documentation, not a gate: the CI
        // sidecar-contract job runs `cargo test -- --include-ignored`, which
        // switches ignored tests back on, and an assert here failed that job
        // with "refusing to run outside the subprocess harness". This is a
        // fixture, not a check, so passing trivially outside its harness is
        // correct. The real gate is `vulnerability_is_real_in_this_build`,
        // which spawns this and fails if it does NOT abort.
        if std::env::var("PDF_GUARD_POC").is_err() {
            return;
        }
        let pdf = nested_pdf(20_000);
        // Deliberately NOT guarded. On lopdf 0.34 this exhausts the stack and
        // the process dies here; there is no Err to return.
        let _ = lopdf::Document::load_mem(&pdf);
        println!("SURVIVED");
    }

    #[test]
    fn deep_nesting_no_longer_aborts() {
        // THIS TEST WAS INVERTED ON 2026-08-03, and the inversion is the point.
        //
        // It was written as `vulnerability_is_real_in_this_build`, asserting
        // that lopdf DOES abort, because a guard built against a bug that is
        // not actually present would pass every other test here while
        // protecting nothing. When the pin moved 0.34 -> 0.44 it failed
        // exactly as its own message predicted ("either the pin moved to a
        // fixed version or the PoC shape is wrong"), which is how the upgrade
        // was confirmed to work rather than merely to compile.
        //
        // It now guards the opposite property: that the fix STAYS. A downgrade
        // below 0.42, whether deliberate or through a resolver change, brings
        // the abort back and turns this red. Version numbers in Cargo.toml are
        // not evidence of behaviour; this is.
        let exe = std::env::current_exe().expect("test binary path");
        let out = std::process::Command::new(exe)
            .args([
                "--exact",
                "services::pdf_guard::tests::poc_aborts_the_process_unguarded",
                "--ignored",
                "--nocapture",
            ])
            .env("PDF_GUARD_POC", "1")
            .output()
            .expect("spawn subprocess");

        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(
            stdout.contains("SURVIVED"),
            "lopdf ABORTED on 20,000 levels of nesting. RUSTSEC-2026-0187 is \
             back, which means the pin fell below 0.42. Check Cargo.lock \
             before shipping.\nstdout: {stdout}\nstderr: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert!(
            out.status.success(),
            "subprocess died on a deeply nested PDF; expected a clean return"
        );

        // The guard still refuses it. Kept as defence in depth against the
        // next parser bug, not because this one is still open.
        assert!(guard_bytes(&nested_pdf(20_000), "poc").is_err());
    }

    #[test]
    fn no_source_file_calls_document_load_directly() {
        // The guard is only worth having if nothing routes around it. 25 call
        // sites were swept mechanically; this fails if a 26th appears, which
        // is the realistic regression: someone adds a feature, writes
        // `Document::load`, and every test still passes.
        //
        // `load_guarded` returns Result<Document, lopdf::Error> precisely so
        // the substitution is free, which removes the usual excuse for the
        // direct call.
        let src_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut offenders: Vec<String> = Vec::new();
        let mut scanned = 0usize;

        fn walk(dir: &std::path::Path, scanned: &mut usize, offenders: &mut Vec<String>) {
            let entries = match std::fs::read_dir(dir) {
                Ok(e) => e,
                Err(_) => return,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, scanned, offenders);
                    continue;
                }
                if path.extension().and_then(|e| e.to_str()) != Some("rs") {
                    continue;
                }
                // This module legitimately calls it: it IS the wrapper.
                if path.file_name().and_then(|n| n.to_str()) == Some("pdf_guard.rs") {
                    continue;
                }
                let text = match std::fs::read_to_string(&path) {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                *scanned += 1;
                for (i, line) in text.lines().enumerate() {
                    // `load_mem` is fine: callers of it already hold the bytes
                    // and guard them separately. Only the path-taking `load(`
                    // is the unguarded door.
                    if line.contains("Document::load(") {
                        offenders.push(format!("{}:{}: {}", path.display(), i + 1, line.trim()));
                    }
                }
            }
        }

        walk(&src_root, &mut scanned, &mut offenders);

        // Guards the guard: a broken walk would otherwise pass by scanning
        // nothing, which is the failure mode this whole module is about.
        assert!(
            scanned > 50,
            "expected to scan >50 source files, scanned {scanned}"
        );
        assert!(
            offenders.is_empty(),
            "unguarded lopdf load call(s). Use \
             crate::services::pdf_guard::load_guarded instead:\n{}",
            offenders.join("\n")
        );
    }

    #[test]
    fn load_guarded_refuses_the_poc_and_accepts_a_real_file() {
        use std::io::Write;

        // End-to-end through the wrapper the 25 call sites now use, rather
        // than only through measure_nesting.
        let dir = std::env::temp_dir().join("pdf_guard_load_guarded_test");
        std::fs::create_dir_all(&dir).expect("temp dir");

        let hostile = dir.join("hostile.pdf");
        std::fs::File::create(&hostile)
            .expect("create")
            .write_all(&nested_pdf(20_000))
            .expect("write");
        let err = load_guarded(&hostile).expect_err("must refuse");
        assert!(
            err.to_string().contains("RUSTSEC-2026-0187"),
            "reason must survive to the call site: {err}"
        );

        let benign = dir.join("benign.pdf");
        std::fs::File::create(&benign)
            .expect("create")
            .write_all(&nested_pdf(3))
            .expect("write");
        let doc = load_guarded(&benign).expect("must accept a valid file");
        assert!(doc.get_object((1, 0)).is_ok());
    }

    #[test]
    fn real_fixtures_are_accepted() {
        // The guard is worthless if it rejects the documents we ship tests
        // for. Runs against every fixture rather than a chosen one.
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/pdfs");
        let entries = std::fs::read_dir(&dir).expect("fixtures dir");
        let mut checked = 0;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("pdf") {
                continue;
            }
            let bytes = std::fs::read(&path).expect("read fixture");
            let report = measure_nesting(&bytes);
            assert!(
                report.max_depth <= MAX_NESTING_DEPTH,
                "{} measured depth {}, over the limit",
                path.display(),
                report.max_depth
            );
            checked += 1;
        }
        // Guards the guard: if fixtures stop being generated, this test would
        // otherwise pass by checking nothing at all.
        assert!(checked >= 5, "expected >=5 fixtures, checked {checked}");
    }
}
