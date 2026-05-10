use anyhow::Result;
use std::path::Path;
use tracing_appender::{non_blocking::WorkerGuard, rolling::Rotation};
use tracing_subscriber::{fmt, EnvFilter, prelude::*};

pub fn init_logging(logs_dir: &Path, level: &str) -> Result<WorkerGuard> {
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
    let file_layer   = fmt::layer().with_writer(file_writer).with_ansi(false).json();

    tracing_subscriber::registry()
        .with(filter)
        .with(stdout_layer)
        .with(file_layer)
        .init();

    tracing::info!("logging initialized at {}", logs_dir.display());
    Ok(guard)
}
