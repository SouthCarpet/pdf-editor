use chrono::Utc;
use pdf_editor_lib::persistence::{db, recent_files::{add_recent, list_recent, remove_recent, RecentFile}};
use tempfile::TempDir;

#[tokio::test]
async fn add_list_remove_recent() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("t.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();

    let f = RecentFile {
        path: "C:/foo.pdf".into(),
        display_name: "foo.pdf".into(),
        last_opened_at: Utc::now(),
        page_count: Some(10),
        size_bytes: Some(1234),
    };
    add_recent(&pool, &f).await.unwrap();

    let list = list_recent(&pool, 10).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].path, "C:/foo.pdf");

    remove_recent(&pool, "C:/foo.pdf").await.unwrap();
    assert!(list_recent(&pool, 10).await.unwrap().is_empty());
}

#[tokio::test]
async fn add_recent_upserts_on_duplicate() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("t.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();

    let mut f = RecentFile {
        path: "C:/dup.pdf".into(),
        display_name: "dup.pdf".into(),
        last_opened_at: Utc::now(),
        page_count: None, size_bytes: None,
    };
    add_recent(&pool, &f).await.unwrap();
    f.page_count = Some(99);
    add_recent(&pool, &f).await.unwrap();

    let list = list_recent(&pool, 10).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].page_count, Some(99));
}
