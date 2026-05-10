use pdf_editor_lib::util::progress::{ProgressEvent, ProgressReporter};
use tokio::sync::mpsc;

#[tokio::test]
async fn reporter_emits_started_progress_done() {
    let (tx, mut rx) = mpsc::channel(16);
    let r = ProgressReporter::new("job-1".to_string(), tx);
    r.started(Some("compress".into())).await;
    r.progress(0.25, Some("step 1/4".into())).await;
    r.progress(1.0, None).await;
    r.done(Some(serde_json::json!({"output": "out.pdf"}))).await;

    let mut events = vec![];
    while let Ok(e) = tokio::time::timeout(std::time::Duration::from_millis(50), rx.recv()).await {
        if let Some(e) = e { events.push(e); } else { break; }
    }
    assert_eq!(events.len(), 4);
    assert!(matches!(events[0], ProgressEvent::Started { .. }));
    assert!(matches!(events[3], ProgressEvent::Done { .. }));
}
