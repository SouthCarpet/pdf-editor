use anyhow::Result;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions},
    ConnectOptions,
};
use std::path::Path;
use std::str::FromStr;

pub async fn create_pool(db_path: &Path) -> Result<SqlitePool> {
    let url = format!("sqlite://{}", db_path.to_string_lossy());
    let opts = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true)
        .disable_statement_logging();
    // Delta H: max_connections(5), not 8.
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;
    // Delta H: best perf for SQLite WAL durability.
    sqlx::query("PRAGMA synchronous = NORMAL")
        .execute(&pool)
        .await?;
    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}
