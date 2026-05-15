use pdf_editor_lib::error::AppError;

#[test]
fn app_error_serializes_with_localized_key() {
    let err = AppError::FileNotFound {
        path: "C:/missing.pdf".into(),
    };
    let json = serde_json::to_string(&err).unwrap();
    assert!(json.contains("\"key\":\"file_not_found\""));
    assert!(json.contains("C:/missing.pdf"));
}

#[test]
fn app_error_password_invalid_serializes() {
    let err = AppError::PasswordInvalid;
    let json = serde_json::to_string(&err).unwrap();
    assert!(json.contains("\"key\":\"password_invalid\""));
}
