use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Done,
    Error,
    Cancelled,
}

impl JobStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Done => "done",
            Self::Error => "error",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStartRecord {
    pub tool_id: String,
    pub started_at: DateTime<Utc>,
    pub input_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobFinishRecord {
    pub id: i64,
    pub status: JobStatus,
    pub finished_at: DateTime<Utc>,
    pub output_paths: Option<Vec<String>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRow {
    pub id: i64,
    pub tool_id: String,
    pub status: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub input_paths: String,
    pub output_paths: Option<String>,
    pub error_message: Option<String>,
}

pub async fn record_job_start(pool: &SqlitePool, r: &JobStartRecord) -> Result<i64> {
    let inputs = serde_json::to_string(&r.input_paths)?;
    let row = sqlx::query(
        "INSERT INTO jobs_history (tool_id, status, started_at, input_paths) VALUES (?, ?, ?, ?) RETURNING id"
    ).bind(&r.tool_id).bind("running").bind(r.started_at).bind(&inputs).fetch_one(pool).await?;
    Ok(sqlx::Row::get(&row, 0))
}

pub async fn record_job_finish(pool: &SqlitePool, r: &JobFinishRecord) -> Result<()> {
    let outputs = match &r.output_paths {
        Some(v) => Some(serde_json::to_string(v)?),
        None => None,
    };
    sqlx::query(
        "UPDATE jobs_history SET status=?, finished_at=?, output_paths=?, error_message=? WHERE id=?"
    ).bind(r.status.as_str()).bind(r.finished_at).bind(outputs).bind(&r.error_message).bind(r.id).execute(pool).await?;
    Ok(())
}

pub async fn list_recent_jobs(pool: &SqlitePool, limit: i64) -> Result<Vec<JobRow>> {
    let rows = sqlx::query_as::<_, (i64, String, String, DateTime<Utc>, Option<DateTime<Utc>>, String, Option<String>, Option<String>)>(
        "SELECT id, tool_id, status, started_at, finished_at, input_paths, output_paths, error_message
         FROM jobs_history ORDER BY started_at DESC LIMIT ?"
    ).bind(limit).fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|t| JobRow {
            id: t.0,
            tool_id: t.1,
            status: t.2,
            started_at: t.3,
            finished_at: t.4,
            input_paths: t.5,
            output_paths: t.6,
            error_message: t.7,
        })
        .collect())
}
