use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("file_not_found: {path}")]
    FileNotFound { path: String },

    #[error("file_corrupted: {detail}")]
    PdfCorrupted { detail: String },

    #[error("password_required")]
    PasswordRequired,

    #[error("password_invalid")]
    PasswordInvalid,

    #[error("sidecar_failed: {tool} exit {exit_code}")]
    SidecarFailed { tool: String, exit_code: i32, stderr_tail: String },

    #[error("cancelled")]
    Cancelled,

    #[error("invalid_argument: {detail}")]
    InvalidArgument { detail: String },

    #[error("io_error: {detail}")]
    IoError { detail: String },

    #[error("internal: {detail}")]
    Internal { detail: String },
}

impl AppError {
    pub fn key(&self) -> &'static str {
        match self {
            Self::FileNotFound { .. } => "file_not_found",
            Self::PdfCorrupted { .. } => "pdf_corrupted",
            Self::PasswordRequired => "password_required",
            Self::PasswordInvalid => "password_invalid",
            Self::SidecarFailed { .. } => "sidecar_failed",
            Self::Cancelled => "cancelled",
            Self::InvalidArgument { .. } => "invalid_argument",
            Self::IoError { .. } => "io_error",
            Self::Internal { .. } => "internal",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut m = ser.serialize_map(Some(2))?;
        m.serialize_entry("key", self.key())?;
        match self {
            Self::FileNotFound { path }                 => m.serialize_entry("data", &serde_json::json!({"path": path}))?,
            Self::PdfCorrupted { detail }               => m.serialize_entry("data", &serde_json::json!({"detail": detail}))?,
            Self::SidecarFailed { tool, exit_code, stderr_tail } => m.serialize_entry("data", &serde_json::json!({"tool": tool, "exit_code": exit_code, "stderr_tail": stderr_tail}))?,
            Self::InvalidArgument { detail }            => m.serialize_entry("data", &serde_json::json!({"detail": detail}))?,
            Self::IoError { detail }                    => m.serialize_entry("data", &serde_json::json!({"detail": detail}))?,
            Self::Internal { detail }                   => m.serialize_entry("data", &serde_json::json!({"detail": detail}))?,
            _ => m.serialize_entry("data", &serde_json::json!({}))?,
        };
        m.end()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::IoError { detail: e.to_string() } }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self { AppError::Internal { detail: format!("{e:#}") } }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self { AppError::Internal { detail: e.to_string() } }
}

pub type AppResult<T> = std::result::Result<T, AppError>;
