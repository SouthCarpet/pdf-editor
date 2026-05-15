use pdf_editor_lib::util::cancellation::CancellationRegistry;
use std::time::Duration;

#[tokio::test]
async fn register_and_cancel_job() {
    let reg = CancellationRegistry::new();
    let token = reg.register("job-1");
    assert!(!token.is_cancelled());
    reg.cancel("job-1");
    assert!(token.is_cancelled());
}

#[tokio::test]
async fn cancel_unknown_is_noop() {
    let reg = CancellationRegistry::new();
    reg.cancel("nope");
}

#[tokio::test]
async fn token_can_be_awaited() {
    let reg = CancellationRegistry::new();
    let token = reg.register("job-2");
    let h = tokio::spawn(async move {
        token.cancelled().await;
        "cancelled"
    });
    tokio::time::sleep(Duration::from_millis(10)).await;
    reg.cancel("job-2");
    assert_eq!(h.await.unwrap(), "cancelled");
}
