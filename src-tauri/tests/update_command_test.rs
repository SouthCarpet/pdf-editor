//! The update-check command reads the stored consent itself (plan 119).
//! `check_for_update` delegates to `check_for_update_with` with the real
//! settings path and the real transport; these tests swap both.
use pdf_editor_lib::commands::update::check_for_update_with;
use pdf_editor_lib::services::release_check::UpdateStatus;
use std::sync::atomic::{AtomicUsize, Ordering};
use tempfile::TempDir;

fn settings_file(tmp: &TempDir, json: &str) -> std::path::PathBuf {
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, json).unwrap();
    path
}

#[tokio::test]
async fn stored_consent_off_is_disabled_and_never_uses_the_transport() {
    let tmp = TempDir::new().unwrap();
    let path = settings_file(&tmp, r#"{ "update_check_enabled": false }"#);
    let calls = AtomicUsize::new(0);

    let result = check_for_update_with(Some(path), |_url| {
        calls.fetch_add(1, Ordering::SeqCst);
        async { Ok((200, br#"{"tag_name":"v9.9.9"}"#.to_vec())) }
    })
    .await;

    assert_eq!(result.status, UpdateStatus::Disabled);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn no_settings_path_is_disabled_and_never_uses_the_transport() {
    let calls = AtomicUsize::new(0);

    let result = check_for_update_with(None, |_url| {
        calls.fetch_add(1, Ordering::SeqCst);
        async { Ok((200, Vec::new())) }
    })
    .await;

    assert_eq!(result.status, UpdateStatus::Disabled);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn stored_consent_on_uses_the_transport_once() {
    let tmp = TempDir::new().unwrap();
    let path = settings_file(&tmp, r#"{ "update_check_enabled": true }"#);
    let calls = AtomicUsize::new(0);

    let result = check_for_update_with(Some(path), |_url| {
        calls.fetch_add(1, Ordering::SeqCst);
        async { Ok((200, br#"{"tag_name":"v99.0.0"}"#.to_vec())) }
    })
    .await;

    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert_eq!(result.status, UpdateStatus::Available);
}
