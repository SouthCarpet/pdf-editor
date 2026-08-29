use pdf_editor_lib::util::cancellation::CancellationRegistry;

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
    // A registered job must be unaffected by cancelling a different,
    // unregistered job id: proves the "unknown id" branch really is a
    // no-op rather than e.g. cancelling everything or panicking.
    let other = reg.register("job-other");
    reg.cancel("nope");
    assert!(
        !other.is_cancelled(),
        "cancelling an unregistered job id must not affect other registered tokens"
    );
}

#[tokio::test]
async fn token_can_be_awaited() {
    let reg = CancellationRegistry::new();
    let token = reg.register("job-2");
    // Readiness handshake instead of a fixed sleep: the spawned task
    // signals right before it starts awaiting cancellation, so the main
    // task only calls `cancel` once the awaiter is provably registered.
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
    let h = tokio::spawn(async move {
        ready_tx.send(()).expect("receiver still waiting");
        token.cancelled().await;
        "cancelled"
    });
    ready_rx.await.expect("spawned task signalled readiness");
    reg.cancel("job-2");
    assert_eq!(h.await.unwrap(), "cancelled");
}
