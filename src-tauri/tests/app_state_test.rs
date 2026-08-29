use pdf_editor_lib::app_state::AppState;
use pdf_editor_lib::persistence::db;
use sqlx::Row;
use tempfile::TempDir;

#[tokio::test]
async fn app_state_uses_the_migrated_pool() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("a.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();
    let state = AppState::new(pool);

    // `state.pool` must be the same, already-migrated pool passed into
    // `new` (not a fresh, unmigrated one), so a migrated table is visible
    // through it.
    let row =
        sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name='recent_files'")
            .fetch_one(&state.pool)
            .await
            .expect("migrated table must be visible through state.pool");
    let name: String = row.get(0);
    assert_eq!(name, "recent_files");
}

#[tokio::test]
async fn app_state_forgets_cancelled_job_ids() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("a.db")).await.unwrap();
    let state = AppState::new(pool);
    let token = state.cancellation.register("job-test");
    assert!(!token.is_cancelled());
    state.cancellation.cancel("job-test");
    assert!(token.is_cancelled());
    state.cancellation.forget("job-test");
    let fresh = state.cancellation.register("job-test");
    assert!(
        !fresh.is_cancelled(),
        "forgotten job id must not carry over cancellation state"
    );
}
