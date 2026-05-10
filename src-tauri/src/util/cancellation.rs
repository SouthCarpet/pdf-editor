use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

#[derive(Default, Clone)]
pub struct CancellationRegistry {
    inner: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl CancellationRegistry {
    pub fn new() -> Self { Self::default() }

    pub fn register(&self, job_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        self.inner.lock().unwrap().insert(job_id.to_string(), token.clone());
        token
    }

    pub fn cancel(&self, job_id: &str) {
        if let Some(t) = self.inner.lock().unwrap().get(job_id) { t.cancel(); }
    }

    pub fn forget(&self, job_id: &str) {
        self.inner.lock().unwrap().remove(job_id);
    }
}
