use chrono::Utc;
use pdf_editor_lib::persistence::{
    db,
    jobs_history::{record_job_start, record_job_finish, list_recent_jobs, JobStatus, JobStartRecord, JobFinishRecord},
    last_session::{save_session_slot, list_session, clear_session, SessionSlot},
};
use tempfile::TempDir;

#[tokio::test]
async fn jobs_history_basics() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("j.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();

    let id = record_job_start(&pool, &JobStartRecord {
        tool_id: "compress".into(),
        started_at: Utc::now(),
        input_paths: vec!["C:/a.pdf".into()],
    }).await.unwrap();

    record_job_finish(&pool, &JobFinishRecord {
        id,
        status: JobStatus::Done,
        finished_at: Utc::now(),
        output_paths: Some(vec!["C:/a_compressed.pdf".into()]),
        error_message: None,
    }).await.unwrap();

    let recent = list_recent_jobs(&pool, 10).await.unwrap();
    assert_eq!(recent.len(), 1);
    assert_eq!(recent[0].tool_id, "compress");
}

#[tokio::test]
async fn last_session_save_and_clear() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("s.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();

    save_session_slot(&pool, &SessionSlot {
        slot: 0, doc_path: "C:/x.pdf".into(), tool: "edit".into(), scroll_y: 100, zoom: 1.5,
    }).await.unwrap();

    let list = list_session(&pool).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].doc_path, "C:/x.pdf");

    clear_session(&pool).await.unwrap();
    assert!(list_session(&pool).await.unwrap().is_empty());
}
