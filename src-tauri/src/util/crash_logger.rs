// Crash & error logging (Delta P).
//
// The Phase 3 `tracing` setup catches `AppError` and structured events, but
// it does NOT catch:
//   - Rust `panic!` calls that bypass `tracing::error!`
//   - Hard OS-level crashes (SIGSEGV / access violations / stack overflow)
//   - Frontend JavaScript errors (window.onerror / unhandledrejection)
//
// This module adds:
//   - `TraceRing` — an in-memory ring buffer (capacity 200) populated by a
//     custom tracing layer (see `logging::RingLayer`). Flushed to disk on
//     panic/crash for context.
//   - `install_panic_hook` — chains the previous panic hook, writes a
//     `<timestamp>.panic.txt` with location, payload, backtrace, and the
//     last ring-buffer events.
//   - `install_unhandled_exception_filter` — Windows-only. Catches OS
//     exceptions via `SetUnhandledExceptionFilter` and writes a `crash.txt`.
//     Returns EXCEPTION_CONTINUE_SEARCH so existing post-mortem tooling
//     (WER, debuggers) still runs.
//   - `write_crash_file` / `timestamp_for_filename` — also used by the
//     `record_frontend_error` Tauri command for JS-side errors.
//
// Filenames use `YYYY-MM-DD_HH-MM-SS.<kind>.txt` — ISO-sortable and
// Windows-safe (`:` is forbidden in NTFS filenames).

use std::collections::VecDeque;
use std::io::Write;
use std::path::Path;
use std::sync::{Arc, Mutex};

const RING_BUFFER_SIZE: usize = 200;

/// In-memory ring buffer of recent tracing events. Captured by a custom
/// tracing layer (see `crate::util::logging::init_logging`) and flushed to
/// disk on panic/crash for diagnostic context.
#[derive(Clone)]
pub struct TraceRing(Arc<Mutex<VecDeque<String>>>);

impl TraceRing {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(VecDeque::with_capacity(
            RING_BUFFER_SIZE,
        ))))
    }

    pub fn push(&self, line: String) {
        if let Ok(mut buf) = self.0.lock() {
            if buf.len() >= RING_BUFFER_SIZE {
                buf.pop_front();
            }
            buf.push_back(line);
        }
    }

    pub fn snapshot(&self) -> Vec<String> {
        self.0
            .lock()
            .map(|buf| buf.iter().cloned().collect())
            .unwrap_or_default()
    }
}

impl Default for TraceRing {
    fn default() -> Self {
        Self::new()
    }
}

/// Returns a Windows-filename-safe timestamp string like `2026-05-10_13-42-15`.
pub fn timestamp_for_filename() -> String {
    timestamp_for_filename_at(&chrono::Local::now())
}

fn timestamp_for_filename_at(now: &chrono::DateTime<chrono::Local>) -> String {
    now.format("%Y-%m-%d_%H-%M-%S").to_string()
}

/// Writes `<logs_dir>/<timestamp>.<kind>.txt`. Best-effort: any IO failure
/// here is silently swallowed because we're already on a crash path and
/// the alternative is making things worse.
pub fn write_crash_file(logs_dir: &Path, kind: &str, body: &str) {
    let _ = std::fs::create_dir_all(logs_dir);
    let path = logs_dir.join(format!("{}.{}.txt", timestamp_for_filename(), kind));
    if let Ok(mut f) = std::fs::File::create(&path) {
        let _ = f.write_all(body.as_bytes());
    }
}

/// Installs a panic hook that writes a `panic.txt` (with location, payload,
/// backtrace, and recent tracing events from `ring`) before forwarding to
/// the previously-installed hook (so default stderr printing still happens).
pub fn install_panic_hook(logs_dir: std::path::PathBuf, ring: TraceRing) {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown>".into());
        let payload = if let Some(s) = info.payload().downcast_ref::<&'static str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "<non-string panic payload>".into()
        };
        let backtrace = std::backtrace::Backtrace::force_capture();

        let mut body = String::new();
        body.push_str(&format!(
            "type: panic\ntimestamp: {}\n",
            chrono::Local::now().to_rfc3339()
        ));
        body.push_str(&format!("location: {location}\n"));
        body.push_str(&format!("payload: {payload}\n\n"));
        body.push_str(&format!("backtrace:\n{backtrace}\n\n"));
        body.push_str("recent tracing events:\n");
        for line in ring.snapshot() {
            body.push_str(&line);
            body.push('\n');
        }

        write_crash_file(&logs_dir, "panic", &body);
        prev(info);
    }));
}

/// Installs a Windows-only Structured Exception Handler that catches OS
/// faults (segfault, access violation, stack overflow) the Rust panic hook
/// cannot see. Returns `EXCEPTION_CONTINUE_SEARCH` so default OS handling
/// (WER, attached debugger) still runs.
#[cfg(target_os = "windows")]
pub fn install_unhandled_exception_filter(logs_dir: std::path::PathBuf) {
    // `EXCEPTION_CONTINUE_SEARCH` is a plain `i32 = 0` constant in
    // `Win32::System::Diagnostics::Debug` (not `Foundation`). The
    // `LPTOP_LEVEL_EXCEPTION_FILTER` type expects a `*const EXCEPTION_POINTERS`.
    use windows::Win32::System::Diagnostics::Debug::{
        SetUnhandledExceptionFilter, EXCEPTION_CONTINUE_SEARCH, EXCEPTION_POINTERS,
    };

    static LOGS_DIR: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
    let _ = LOGS_DIR.set(logs_dir);

    unsafe extern "system" fn handler(info: *const EXCEPTION_POINTERS) -> i32 {
        let dir = LOGS_DIR
            .get()
            .cloned()
            .unwrap_or_else(|| std::path::PathBuf::from("logs"));
        let code = if !info.is_null() && !unsafe { (*info).ExceptionRecord }.is_null() {
            unsafe { (*(*info).ExceptionRecord).ExceptionCode.0 }
        } else {
            0
        };
        let body = format!(
            "type: crash\ntimestamp: {}\nexception_code: 0x{:08X}\n",
            chrono::Local::now().to_rfc3339(),
            code
        );
        write_crash_file(&dir, "crash", &body);
        EXCEPTION_CONTINUE_SEARCH
    }

    // `LPTOP_LEVEL_EXCEPTION_FILTER` is itself an `Option<unsafe extern
    // "system" fn(...) -> i32>`, so the outer `SetUnhandledExceptionFilter`
    // takes `Option<LPTOP_LEVEL_EXCEPTION_FILTER>` — that's `Option<Option<fn>>`.
    // Coerce the fn item to a function pointer before the double-`Some` so
    // the type-inference picks the right `Option<fn>` flavor.
    let cb: unsafe extern "system" fn(*const EXCEPTION_POINTERS) -> i32 = handler;
    unsafe {
        SetUnhandledExceptionFilter(Some(Some(cb)));
    }
}

/// No-op fallback for non-Windows targets so callers don't need cfg gates.
#[cfg(not(target_os = "windows"))]
pub fn install_unhandled_exception_filter(_logs_dir: std::path::PathBuf) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_caps_at_capacity() {
        let ring = TraceRing::new();
        for i in 0..(RING_BUFFER_SIZE + 50) {
            ring.push(format!("line {i}"));
        }
        let snap = ring.snapshot();
        assert_eq!(snap.len(), RING_BUFFER_SIZE);
        assert_eq!(snap.first().unwrap(), &format!("line {}", 50));
        assert_eq!(
            snap.last().unwrap(),
            &format!("line {}", RING_BUFFER_SIZE + 49)
        );
    }

    #[test]
    fn timestamp_filename_has_no_colons() {
        use chrono::TimeZone;
        let now = chrono::Local
            .with_ymd_and_hms(2026, 5, 10, 13, 42, 15)
            .single()
            .expect("valid local fixture time");

        assert_eq!(timestamp_for_filename_at(&now), "2026-05-10_13-42-15");
    }

    #[test]
    fn write_crash_file_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        write_crash_file(dir.path(), "test", "hello world");
        let files: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(files.len(), 1);
        assert!(files[0].ends_with(".test.txt"));
        let body = std::fs::read_to_string(dir.path().join(&files[0])).unwrap();
        assert_eq!(body, "hello world");
    }
}
