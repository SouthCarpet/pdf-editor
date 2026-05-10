use pdf_editor_lib::persistence::{db, autosave::{put_autosave, get_autosave, delete_autosave}};
use tempfile::TempDir;

#[tokio::test]
async fn autosave_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("a.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();

    put_autosave(&pool, "C:/x.pdf", r#"{"edits":1}"#).await.unwrap();
    let got = get_autosave(&pool, "C:/x.pdf").await.unwrap();
    assert_eq!(got.unwrap(), r#"{"edits":1}"#);

    delete_autosave(&pool, "C:/x.pdf").await.unwrap();
    assert!(get_autosave(&pool, "C:/x.pdf").await.unwrap().is_none());
}
