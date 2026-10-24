// Plan 119 O1: own form fields. Red step: types only, no writer yet.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum OwnFieldKind {
    Text,
    Checkbox,
}

pub fn sanitize_field_name(name: &str) -> String {
    name.to_string()
}
