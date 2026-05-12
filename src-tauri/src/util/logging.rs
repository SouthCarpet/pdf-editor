// Tracing setup (Phase 3 Task 19) + Delta P RingLayer.
//
// `init_logging` builds three subscriber layers:
//   1. stdout fmt layer (human-readable, no ANSI for Windows-friendly logs)
//   2. JSON file layer with daily rotation (kept 7 days) in `<logs_dir>`
//   3. RingLayer that copies each event into an in-memory `TraceRing`
//      so the crash logger (Delta P) can flush the last 200 events to a
//      panic.txt / crash.txt on hard failure.

use anyhow::Result;
use std::fmt::Write as _;
use std::path::Path;
use tracing::{Event, Subscriber};
use tracing_appender::{non_blocking::WorkerGuard, rolling::Rotation};
use tracing_subscriber::{fmt, layer::Context, prelude::*, EnvFilter, Layer};

use crate::util::crash_logger::TraceRing;

/// Custom tracing Layer that formats each event into a single line and
/// pushes it onto the shared `TraceRing`. Format:
///   `HH:MM:SS.mmm LEVEL target: field=value ...`
struct RingLayer {
    ring: TraceRing,
}

impl<S: Subscriber> Layer<S> for RingLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let mut s = String::new();
        let _ = write!(
            s,
            "{} {} {}: ",
            chrono::Local::now().format("%H:%M:%S%.3f"),
            event.metadata().level(),
            event.metadata().target()
        );

        // Visitor that flattens each (field, value) pair into the line.
        struct V<'a>(&'a mut String);
        impl<'a> tracing::field::Visit for V<'a> {
            fn record_debug(
                &mut self,
                field: &tracing::field::Field,
                value: &dyn std::fmt::Debug,
            ) {
                let _ = write!(self.0, "{}={:?} ", field.name(), value);
            }
        }

        event.record(&mut V(&mut s));
        self.ring.push(s);
    }
}

pub fn init_logging(logs_dir: &Path, level: &str, ring: TraceRing) -> Result<WorkerGuard> {
    std::fs::create_dir_all(logs_dir)?;

    let file_appender = tracing_appender::rolling::Builder::new()
        .rotation(Rotation::DAILY)
        .filename_prefix("pdf-editor")
        .filename_suffix("log")
        .max_log_files(7)
        .build(logs_dir)?;

    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::try_new(level).unwrap_or_else(|_| EnvFilter::new("info"));

    let stdout_layer = fmt::layer().with_target(true).with_ansi(false);
    let file_layer = fmt::layer().with_writer(file_writer).with_ansi(false).json();
    let ring_layer = RingLayer { ring };

    tracing_subscriber::registry()
        .with(filter)
        .with(stdout_layer)
        .with(file_layer)
        .with(ring_layer)
        .init();

    tracing::info!("logging initialized at {}", logs_dir.display());
    Ok(guard)
}
