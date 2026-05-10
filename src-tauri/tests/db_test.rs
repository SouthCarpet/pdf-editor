use pdf_editor_lib::persistence::db::{create_pool, run_migrations};
use sqlx::Row;
use tempfile::TempDir;

#[tokio::test]
async fn db_pool_initializes_and_migrates() {
    let tmp = TempDir::new().unwrap();
    let db_path = tmp.path().join("test.db");
    let pool = create_pool(&db_path).await.expect("pool");
    run_migrations(&pool).await.expect("migrate");

    let row = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name='recent_files'")
        .fetch_one(&pool).await.expect("query");
    let name: String = row.get(0);
    assert_eq!(name, "recent_files");
}
