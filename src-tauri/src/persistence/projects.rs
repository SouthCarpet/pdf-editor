use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewProject {
    pub name: String,
    pub description: Option<String>,
}

pub async fn create_project(pool: &SqlitePool, p: &NewProject) -> Result<i64> {
    let now = Utc::now();
    let row = sqlx::query(
        "INSERT INTO projects (name, description, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id"
    ).bind(&p.name).bind(&p.description).bind(now).bind(now).fetch_one(pool).await?;
    Ok(sqlx::Row::get(&row, 0))
}

pub async fn list_projects(pool: &SqlitePool) -> Result<Vec<Project>> {
    let rows = sqlx::query_as::<_, (i64, String, Option<String>, DateTime<Utc>, DateTime<Utc>)>(
        "SELECT id, name, description, created_at, updated_at FROM projects ORDER BY updated_at DESC"
    ).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(id, name, description, created_at, updated_at)| {
        Project { id, name, description, created_at, updated_at }
    }).collect())
}

pub async fn get_project(pool: &SqlitePool, id: i64) -> Result<Option<Project>> {
    let opt = sqlx::query_as::<_, (i64, String, Option<String>, DateTime<Utc>, DateTime<Utc>)>(
        "SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?"
    ).bind(id).fetch_optional(pool).await?;
    Ok(opt.map(|(id, name, description, created_at, updated_at)| {
        Project { id, name, description, created_at, updated_at }
    }))
}

pub async fn update_project(pool: &SqlitePool, p: &Project) -> Result<()> {
    sqlx::query("UPDATE projects SET name=?, description=?, updated_at=? WHERE id=?")
        .bind(&p.name).bind(&p.description).bind(Utc::now()).bind(p.id).execute(pool).await?;
    Ok(())
}

pub async fn delete_project(pool: &SqlitePool, id: i64) -> Result<()> {
    sqlx::query("DELETE FROM projects WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

pub async fn add_project_file(pool: &SqlitePool, project_id: i64, path: &str) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO project_files (project_id, path, added_at) VALUES (?, ?, ?)")
        .bind(project_id).bind(path).bind(Utc::now()).execute(pool).await?;
    Ok(())
}

pub async fn remove_project_file(pool: &SqlitePool, project_id: i64, path: &str) -> Result<()> {
    sqlx::query("DELETE FROM project_files WHERE project_id = ? AND path = ?")
        .bind(project_id).bind(path).execute(pool).await?;
    Ok(())
}

pub async fn list_project_files(pool: &SqlitePool, project_id: i64) -> Result<Vec<String>> {
    let rows = sqlx::query_as::<_, (String,)>(
        "SELECT path FROM project_files WHERE project_id = ? ORDER BY added_at"
    ).bind(project_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(p,)| p).collect())
}

pub async fn add_project_pipeline(pool: &SqlitePool, project_id: i64, preset_id: i64) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO project_pipelines (project_id, preset_id) VALUES (?, ?)")
        .bind(project_id).bind(preset_id).execute(pool).await?;
    Ok(())
}

pub async fn remove_project_pipeline(pool: &SqlitePool, project_id: i64, preset_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM project_pipelines WHERE project_id = ? AND preset_id = ?")
        .bind(project_id).bind(preset_id).execute(pool).await?;
    Ok(())
}

pub async fn list_project_pipelines(pool: &SqlitePool, project_id: i64) -> Result<Vec<i64>> {
    let rows = sqlx::query_as::<_, (i64,)>(
        "SELECT preset_id FROM project_pipelines WHERE project_id = ?"
    ).bind(project_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}
