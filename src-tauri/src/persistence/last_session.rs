use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSlot {
    pub slot: i64,
    pub doc_path: String,
    pub tool: String,
    pub scroll_y: i64,
    pub zoom: f64,
}

pub async fn save_session_slot(pool: &SqlitePool, s: &SessionSlot) -> Result<()> {
    sqlx::query(
        "INSERT INTO last_session (slot, doc_path, tool, scroll_y, zoom) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slot) DO UPDATE SET doc_path=excluded.doc_path, tool=excluded.tool, scroll_y=excluded.scroll_y, zoom=excluded.zoom"
    ).bind(s.slot).bind(&s.doc_path).bind(&s.tool).bind(s.scroll_y).bind(s.zoom).execute(pool).await?;
    Ok(())
}

pub async fn list_session(pool: &SqlitePool) -> Result<Vec<SessionSlot>> {
    let rows = sqlx::query_as::<_, (i64, String, String, i64, f64)>(
        "SELECT slot, doc_path, tool, scroll_y, zoom FROM last_session ORDER BY slot"
    ).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(slot, doc_path, tool, scroll_y, zoom)| {
        SessionSlot { slot, doc_path, tool, scroll_y, zoom }
    }).collect())
}

pub async fn clear_session(pool: &SqlitePool) -> Result<()> {
    sqlx::query("DELETE FROM last_session").execute(pool).await?;
    Ok(())
}
