use std::path::Path;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::sidecars::manager::{SidecarManager, SidecarRunSpec};

pub struct MupdfWrapper {
    mgr: SidecarManager,
}

impl MupdfWrapper {
    pub fn new(mgr: SidecarManager) -> Self {
        Self { mgr }
    }

    pub async fn clean_subset_fonts(
        &self,
        input: &Path,
        output: &Path,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "clean".into(),
            "-gggg".into(),
            "-S".into(),
            input.display().to_string(),
            output.display().to_string(),
        ];
        self.run(args, cancel, Duration::from_secs(60)).await
    }

    pub async fn extract_text(&self, input: &Path) -> AppResult<String> {
        let args = vec![
            "convert".into(),
            "-F".into(),
            "text".into(),
            "-O".into(),
            "preserve-images=no".into(),
            "-o".into(),
            "-".into(),
            input.display().to_string(),
        ];
        let spec = SidecarRunSpec {
            name: "mutool".into(),
            args,
            stdin: None,
            timeout: Some(Duration::from_secs(60)),
            cancellation: None,
        };
        let out = self.mgr.run(spec).await?;
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }

    async fn run(
        &self,
        args: Vec<String>,
        cancel: Option<CancellationToken>,
        timeout: Duration,
    ) -> AppResult<()> {
        let spec = SidecarRunSpec {
            name: "mutool".into(),
            args,
            stdin: None,
            timeout: Some(timeout),
            cancellation: cancel,
        };
        self.mgr.run(spec).await.map(|_| ())
    }
}
