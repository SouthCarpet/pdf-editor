use serde::Serialize;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ProgressEvent {
    Started {
        job_id: String,
        label: Option<String>,
    },
    Progress {
        job_id: String,
        ratio: f32,
        label: Option<String>,
    },
    Done {
        job_id: String,
        result: Option<serde_json::Value>,
    },
    Error {
        job_id: String,
        key: String,
        detail: Option<String>,
    },
}

pub struct ProgressReporter {
    job_id: String,
    tx: mpsc::Sender<ProgressEvent>,
}

impl ProgressReporter {
    pub fn new(job_id: String, tx: mpsc::Sender<ProgressEvent>) -> Self {
        Self { job_id, tx }
    }
    pub fn job_id(&self) -> &str {
        &self.job_id
    }

    pub async fn started(&self, label: Option<String>) {
        let _ = self
            .tx
            .send(ProgressEvent::Started {
                job_id: self.job_id.clone(),
                label,
            })
            .await;
    }
    pub async fn progress(&self, ratio: f32, label: Option<String>) {
        let _ = self
            .tx
            .send(ProgressEvent::Progress {
                job_id: self.job_id.clone(),
                ratio: ratio.clamp(0.0, 1.0),
                label,
            })
            .await;
    }
    pub async fn done(&self, result: Option<serde_json::Value>) {
        let _ = self
            .tx
            .send(ProgressEvent::Done {
                job_id: self.job_id.clone(),
                result,
            })
            .await;
    }
    pub async fn error(&self, key: String, detail: Option<String>) {
        let _ = self
            .tx
            .send(ProgressEvent::Error {
                job_id: self.job_id.clone(),
                key,
                detail,
            })
            .await;
    }
}
