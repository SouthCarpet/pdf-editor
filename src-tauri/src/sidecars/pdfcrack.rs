use std::path::Path;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::sidecars::manager::{SidecarManager, SidecarRunSpec};

pub struct PdfcrackWrapper {
    mgr: SidecarManager,
}

impl PdfcrackWrapper {
    pub fn new(mgr: SidecarManager) -> Self {
        Self { mgr }
    }

    pub async fn dictionary_attack(
        &self,
        pdf: &Path,
        wordlist: &Path,
        cancel: Option<CancellationToken>,
    ) -> AppResult<Option<String>> {
        let spec = SidecarRunSpec {
            name: "pdfcrack".into(),
            args: vec![
                "-f".into(),
                pdf.display().to_string(),
                "-w".into(),
                wordlist.display().to_string(),
            ],
            stdin: None,
            timeout: Some(Duration::from_secs(900)),
            cancellation: cancel,
        };
        let out = self.mgr.run(spec).await?;
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("found user-password: '") {
                if let Some(end) = rest.rfind('\'') {
                    return Ok(Some(rest[..end].to_string()));
                }
            }
        }
        Ok(None)
    }

    pub async fn brute_force(
        &self,
        pdf: &Path,
        charset: &str,
        min_len: u8,
        max_len: u8,
        cancel: Option<CancellationToken>,
    ) -> AppResult<Option<String>> {
        let spec = SidecarRunSpec {
            name: "pdfcrack".into(),
            args: vec![
                "-f".into(),
                pdf.display().to_string(),
                "-c".into(),
                charset.into(),
                "-n".into(),
                min_len.to_string(),
                "-m".into(),
                max_len.to_string(),
            ],
            stdin: None,
            timeout: None,
            cancellation: cancel,
        };
        let out = self.mgr.run(spec).await?;
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("found user-password: '") {
                if let Some(end) = rest.rfind('\'') {
                    return Ok(Some(rest[..end].to_string()));
                }
            }
        }
        Ok(None)
    }
}
