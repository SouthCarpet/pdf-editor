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

    let started = rx.recv().await.expect("started event");
    let quarter = rx.recv().await.expect("quarter-progress event");
    let complete = rx.recv().await.expect("complete-progress event");
    let done = rx.recv().await.expect("done event");

    assert!(matches!(
        started,
        ProgressEvent::Started {
            ref job_id,
            label: Some(ref label)
        } if job_id == "job-1" && label == "compress"
    ));
    assert!(matches!(
        quarter,
        ProgressEvent::Progress {
            ratio,
            label: Some(ref label),
            ..
        } if ratio == 0.25 && label == "step 1/4"
    ));
    assert!(matches!(
        complete,
        ProgressEvent::Progress { ratio, label: None, .. } if ratio == 1.0
    ));
    assert!(matches!(done, ProgressEvent::Done { .. }));
}
