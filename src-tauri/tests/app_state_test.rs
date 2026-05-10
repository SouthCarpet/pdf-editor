use pdf_editor_lib::app_state::AppState;
use pdf_editor_lib::persistence::db;
use tempfile::TempDir;

#[tokio::test]
async fn app_state_constructs() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("a.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();
    let state = AppState::new(pool);
    // Touch every Arc to ensure the wrapper fields are wired.
    let _q = state.qpdf.clone();
    let _g = state.gs.clone();
    let _m = state.mupdf.clone();
    let _s = state.soffice.clone();
    let _t = state.tesseract.clone();
    let _p = state.pdfcrack.clone();
    // Cancellation registry should be usable.
    let _tok = state.cancellation.register("job-test");
    state.cancellation.forget("job-test");
}
