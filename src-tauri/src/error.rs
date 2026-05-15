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
    SidecarFailed {
        tool: String,
        exit_code: i32,
        stderr_tail: String,
    },

    #[error("cancelled")]
    Cancelled,

    #[error("invalid_argument: {detail}")]
    InvalidArgument { detail: String },

    #[error("io_error: {detail}")]
    IoError { detail: String },

    #[error("internal: {detail}")]
    Internal { detail: String },

    /// Surfaced when a sub-feature is deliberately not yet implemented (user
    /// directive 2026-05-10: never silently degrade). The frontend renders a
    /// "feature not yet available" message with the `feature` payload.
    #[error("unimplemented: {feature}")]
    Unimplemented { feature: String },

    /// Encoding inversion failure for Tier 3 text edit: the requested target
    /// font/encoding does not have a glyph for one or more characters of the
    /// new string. Payload includes the missing character(s) for diagnostics.
    #[error("encoding_mismatch: {detail}")]
    EncodingMismatch { detail: String },
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
            Self::Unimplemented { .. } => "unimplemented",
            Self::EncodingMismatch { .. } => "encoding_mismatch",
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
            Self::Unimplemented { feature }             => m.serialize_entry("data", &serde_json::json!({"feature": feature}))?,
            Self::EncodingMismatch { detail }           => m.serialize_entry("data", &serde_json::json!({"detail": detail}))?,
            _ => m.serialize_entry("data", &serde_json::json!({}))?,
        };
        m.end()
    }
}

// Manual specta::Type impl: serialized shape is `{ key: string, data: object }`.
// We can't auto-derive because of the custom Serialize that flattens variants
// into this shape. `data` is intentionally typed as a TypeScript `Record<string,
// unknown>` via `specta_typescript::opaque::define`: each variant has its own
// payload shape (FileNotFound carries `path`, SidecarFailed carries `tool +
// exit_code + stderr_tail`, etc.) and the front-end discriminates on `key`.
// Trying to fully derive the union would require duplicating the variant list
// here; an opaque object is honest about the structural-typing tradeoff.
//
// Calling `serde_json::Value::definition` directly here would stack-overflow
// because specta's built-in impl uses `Vec<Value>` and `Map<String, Value>`
// recursively without an NDT boundary to break the cycle.
impl specta::Type for AppError {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        use specta::datatype::{Field, Struct};
        Struct::named()
            .field(
                "key",
                Field::new(<String as specta::Type>::definition(types)),
            )
            .field(
                "data",
                Field::new(<specta_typescript::Unknown as specta::Type>::definition(
                    types,
                )),
            )
            .build()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::IoError {
            detail: e.to_string(),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal {
            detail: format!("{e:#}"),
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Internal {
            detail: e.to_string(),
        }
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;
