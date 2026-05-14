use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PipelinePreset {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub graph_json: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewPipelinePreset {
    pub name: String,
    pub description: Option<String>,
    pub graph_json: String,
}

pub async fn create_preset(pool: &SqlitePool, p: &NewPipelinePreset) -> Result<i64> {
    let now = Utc::now();
    let row = sqlx::query("INSERT INTO pipeline_presets (name, description, graph_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
        .bind(&p.name).bind(&p.description).bind(&p.graph_json).bind(now).bind(now)
        .fetch_one(pool).await?;
    Ok(sqlx::Row::get(&row, 0))
}

pub async fn list_presets(pool: &SqlitePool) -> Result<Vec<PipelinePreset>> {
    let rows = sqlx::query_as::<_, (i64, String, Option<String>, String, DateTime<Utc>, DateTime<Utc>)>(
        "SELECT id, name, description, graph_json, created_at, updated_at FROM pipeline_presets ORDER BY name"
    ).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(id, name, description, graph_json, created_at, updated_at)| {
        PipelinePreset { id, name, description, graph_json, created_at, updated_at }
    }).collect())
}

pub async fn get_preset(pool: &SqlitePool, id: i64) -> Result<Option<PipelinePreset>> {
    let opt = sqlx::query_as::<_, (i64, String, Option<String>, String, DateTime<Utc>, DateTime<Utc>)>(
        "SELECT id, name, description, graph_json, created_at, updated_at FROM pipeline_presets WHERE id = ?"
    ).bind(id).fetch_optional(pool).await?;
    Ok(opt.map(|(id, name, description, graph_json, created_at, updated_at)| {
        PipelinePreset { id, name, description, graph_json, created_at, updated_at }
    }))
}

pub async fn update_preset(pool: &SqlitePool, p: &PipelinePreset) -> Result<()> {
    sqlx::query("UPDATE pipeline_presets SET name=?, description=?, graph_json=?, updated_at=? WHERE id=?")
        .bind(&p.name).bind(&p.description).bind(&p.graph_json).bind(Utc::now()).bind(p.id)
        .execute(pool).await?;
    Ok(())
}

pub async fn delete_preset(pool: &SqlitePool, id: i64) -> Result<()> {
    sqlx::query("DELETE FROM pipeline_presets WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}
