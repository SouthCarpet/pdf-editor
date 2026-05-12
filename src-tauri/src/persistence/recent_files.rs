use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct RecentFile {
    pub path: String,
    pub display_name: String,
    pub last_opened_at: DateTime<Utc>,
    pub page_count: Option<i64>,
    pub size_bytes: Option<i64>,
}

pub async fn add_recent(pool: &SqlitePool, f: &RecentFile) -> Result<()> {
    sqlx::query(
        r#"INSERT INTO recent_files (path, display_name, last_opened_at, page_count, size_bytes)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET
             display_name = excluded.display_name,
             last_opened_at = excluded.last_opened_at,
             page_count = excluded.page_count,
             size_bytes = excluded.size_bytes"#,
    )
    .bind(&f.path)
    .bind(&f.display_name)
    .bind(f.last_opened_at)
    .bind(f.page_count)
    .bind(f.size_bytes)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_recent(pool: &SqlitePool, limit: i64) -> Result<Vec<RecentFile>> {
    let rows = sqlx::query_as::<_, (String, String, DateTime<Utc>, Option<i64>, Option<i64>)>(
        "SELECT path, display_name, last_opened_at, page_count, size_bytes
         FROM recent_files ORDER BY last_opened_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(path, display_name, last_opened_at, page_count, size_bytes)| {
        RecentFile { path, display_name, last_opened_at, page_count, size_bytes }
    }).collect())
}

pub async fn remove_recent(pool: &SqlitePool, path: &str) -> Result<()> {
    sqlx::query("DELETE FROM recent_files WHERE path = ?").bind(path).execute(pool).await?;
    Ok(())
}

pub async fn clear_recent(pool: &SqlitePool) -> Result<()> {
    sqlx::query("DELETE FROM recent_files").execute(pool).await?;
    Ok(())
}
