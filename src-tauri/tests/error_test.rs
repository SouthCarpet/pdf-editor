use pdf_editor_lib::error::AppError;

#[test]
fn app_error_serializes_with_localized_key() {
    let err = AppError::FileNotFound {
        path: "C:/missing.pdf".into(),
    };
    let value = serde_json::to_value(&err).unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "key": "file_not_found",
            "data": { "path": "C:/missing.pdf" }
        })
    );
}

#[test]
fn app_error_password_invalid_serializes() {
    let err = AppError::PasswordInvalid;
    let value = serde_json::to_value(&err).unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "key": "password_invalid",
            "data": {}
        })
    );
}
