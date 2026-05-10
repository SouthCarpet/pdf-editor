use std::path::Path;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::sidecars::manager::{SidecarManager, SidecarRunSpec};

pub struct QpdfWrapper {
    mgr: SidecarManager,
}

impl QpdfWrapper {
    pub fn new(mgr: SidecarManager) -> Self {
        Self { mgr }
    }

    pub async fn decrypt(
        &self,
        input: &Path,
        output: &Path,
        password: Option<&str>,
    ) -> AppResult<()> {
        let mut args = vec!["--decrypt".into()];
        if let Some(p) = password {
            args.push(format!("--password={p}"));
        }
        args.push(input.display().to_string());
        args.push(output.display().to_string());
        self.run(args, None).await
    }

    pub async fn linearize(
        &self,
        input: &Path,
        output: &Path,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "--linearize".into(),
            input.display().to_string(),
            output.display().to_string(),
        ];
        self.run(args, cancel).await
    }

    pub async fn flatten_annotations(
        &self,
        input: &Path,
        output: &Path,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "--flatten-annotations=all".into(),
            input.display().to_string(),
            output.display().to_string(),
        ];
        self.run(args, cancel).await
    }

    pub async fn object_streams_generate(
        &self,
        input: &Path,
        output: &Path,
        cancel: Option<CancellationToken>,
    ) -> AppResult<()> {
        let args = vec![
            "--object-streams=generate".into(),
            "--remove-unreferenced-resources=yes".into(),
            input.display().to_string(),
            output.display().to_string(),
        ];
        self.run(args, cancel).await
    }

    async fn run(&self, args: Vec<String>, cancel: Option<CancellationToken>) -> AppResult<()> {
        let spec = SidecarRunSpec {
            name: "qpdf".into(),
            args,
            stdin: None,
            timeout: Some(Duration::from_secs(120)),
            cancellation: cancel,
        };
        self.mgr.run(spec).await.map(|_| ())
    }
}
