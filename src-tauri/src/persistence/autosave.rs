use anyhow::Result;
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn put_autosave(pool: &SqlitePool, doc_path: &str, patch_json: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO autosave (doc_path, patch_json, saved_at) VALUES (?, ?, ?)
         ON CONFLICT(doc_path) DO UPDATE SET patch_json = excluded.patch_json, saved_at = excluded.saved_at"
    ).bind(doc_path).bind(patch_json).bind(Utc::now()).execute(pool).await?;
    Ok(())
}

pub async fn get_autosave(pool: &SqlitePool, doc_path: &str) -> Result<Option<String>> {
    let row = sqlx::query_as::<_, (String,)>("SELECT patch_json FROM autosave WHERE doc_path = ?")
        .bind(doc_path).fetch_optional(pool).await?;
    Ok(row.map(|(json,)| json))
}

pub async fn delete_autosave(pool: &SqlitePool, doc_path: &str) -> Result<()> {
    sqlx::query("DELETE FROM autosave WHERE doc_path = ?").bind(doc_path).execute(pool).await?;
    Ok(())
}
