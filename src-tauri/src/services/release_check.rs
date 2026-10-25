//! Opt-in check for a newer stable release on GitHub (plan 119).
//!
//! This is the only module that holds an HTTP client. It makes one
//! unauthenticated GET to `RELEASES_URL`, only when the stored consent
//! `update_check_enabled` is on. `HttpDownload` is the transport that
//! `update_install.rs` uses after the user clicks **Update**; that module
//! checks every URL against its host list before it calls `get`.
//! `scripts/test-privacy.ps1` fails the build when `reqwest` appears in any
//! other source file.
//!
//! Every failure comes back as a status the caller can show; nothing panics
//! or opens a dialog.
use crate::services::update_install::{BodyStream, Download, Hop};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::time::Duration;

pub const RELEASES_URL: &str =
    "https://api.github.com/repos/SouthCarpet/pdf-editor/releases/latest";
const USER_AGENT: &str = concat!("pdf-editor/", env!("CARGO_PKG_VERSION"));
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
/// A larger response is a transport failure, never buffered without limit.
const MAX_BODY_BYTES: usize = 1024 * 1024;
/// A setup download may take minutes; only a stalled connection fails it.
const DOWNLOAD_READ_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum UpdateStatus {
    /// The consent is off or cannot be read. No request was made.
    Disabled,
    /// The latest stable release is not newer than this build.
    UpToDate,
    /// A newer stable release exists.
    Available,
    /// The request did not complete: offline, DNS, TLS or timeout.
    ConnectionError,
    /// GitHub answered, but not with a usable stable release.
    ResponseError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct UpdateCheck {
    pub status: UpdateStatus,
    pub current_version: String,
    /// The latest stable release version (`X.Y.Z`, no `v`), when known.
    pub latest_version: Option<String>,
    /// The release tag as GitHub lists it (`vX.Y.Z`). **Update** passes it
    /// back, and the download refuses a release whose tag changed.
    pub tag: Option<String>,
    pub release_url: Option<String>,
    /// Error text for `ConnectionError` and `ResponseError`.
    pub detail: Option<String>,
}

impl UpdateCheck {
    fn new(status: UpdateStatus, current: &str) -> Self {
        Self {
            status,
            current_version: current.to_owned(),
            latest_version: None,
            tag: None,
            release_url: None,
            detail: None,
        }
    }

    fn failed(status: UpdateStatus, current: &str, detail: String) -> Self {
        Self {
            detail: Some(detail),
            ..Self::new(status, current)
        }
    }
}

/// The subset of GitHub's release JSON this check reads.
#[derive(Deserialize)]
struct GithubRelease {
    tag_name: Option<String>,
    html_url: Option<String>,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    assets: Vec<ReleaseAsset>,
}

/// One file attached to a release.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    #[serde(default)]
    pub size: u64,
}

/// The latest release, when it is a stable `vX.Y.Z`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StableRelease {
    pub tag: String,
    pub version: (u64, u64, u64),
    pub html_url: Option<String>,
    pub assets: Vec<ReleaseAsset>,
}

/// `X.Y.Z` with an optional leading `v` or `V`; anything else is `None`,
/// including a pre-release suffix such as `-rc1`.
pub fn stable_version(input: &str) -> Option<(u64, u64, u64)> {
    let input = input
        .strip_prefix('v')
        .or_else(|| input.strip_prefix('V'))
        .unwrap_or(input);
    let mut parts = input.split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let version = (next()?, next()?, next()?);
    parts.next().is_none().then_some(version)
}

fn response_error(current: &str, detail: impl Into<String>) -> UpdateCheck {
    UpdateCheck::failed(UpdateStatus::ResponseError, current, detail.into())
}

/// Reads one GitHub answer; `Err` is the text the user sees.
pub fn parse_stable_release(status: u16, body: &[u8]) -> Result<StableRelease, String> {
    if !(200..300).contains(&status) {
        return Err(format!("GitHub answered HTTP {status}"));
    }
    let release = serde_json::from_slice::<GithubRelease>(body)
        .map_err(|_| "GitHub sent a response that is not release JSON".to_owned())?;
    let tag = release.tag_name.unwrap_or_default();
    let stable = stable_version(&tag).filter(|_| !release.prerelease && !release.draft);
    let Some(version) = stable else {
        return Err(format!(
            "latest release tag \"{tag}\" is not a stable vX.Y.Z"
        ));
    };
    Ok(StableRelease {
        tag,
        version,
        html_url: release.html_url,
        assets: release.assets,
    })
}

/// Turns one GitHub response into a status.
pub fn evaluate(current: &str, status: u16, body: &[u8]) -> UpdateCheck {
    let release = match parse_stable_release(status, body) {
        Ok(release) => release,
        Err(detail) => return response_error(current, detail),
    };
    let latest = release.version;
    let newer = stable_version(current).is_some_and(|running| latest > running);
    UpdateCheck {
        latest_version: Some(format!("{}.{}.{}", latest.0, latest.1, latest.2)),
        tag: Some(release.tag),
        release_url: release.html_url,
        ..UpdateCheck::new(
            if newer {
                UpdateStatus::Available
            } else {
                UpdateStatus::UpToDate
            },
            current,
        )
    }
}

/// The consent gate. `send` is the transport; with `consent` off it is
/// never called, so no request leaves the machine.
pub async fn check_with<F, Fut>(consent: bool, current: &str, send: F) -> UpdateCheck
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<(u16, Vec<u8>), String>>,
{
    if !consent {
        return UpdateCheck::new(UpdateStatus::Disabled, current);
    }
    match send(RELEASES_URL.to_owned()).await {
        Ok((status, body)) => evaluate(current, status, &body),
        Err(error) => UpdateCheck::failed(UpdateStatus::ConnectionError, current, error),
    }
}

/// The real transport: one GET, no redirects, a timeout and a body cap.
pub async fn send_request(url: String) -> Result<(u16, Vec<u8>), String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BODY_BYTES {
            return Err(format!("response is larger than {MAX_BODY_BYTES} bytes"));
        }
    }
    Ok((status, body))
}

/// The real asset transport for `update_install.rs`: one GET, no
/// redirects (the caller follows them after its host check), and the body
/// read in chunks so the caller can stop at its size limit.
pub struct HttpDownload;

pub struct HttpBody(reqwest::Response);

impl BodyStream for HttpBody {
    async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, String> {
        let chunk = self.0.chunk().await.map_err(|e| e.to_string())?;
        Ok(chunk.map(|bytes| bytes.to_vec()))
    }
}

impl Download for HttpDownload {
    type Body = HttpBody;

    async fn get(&self, url: &str) -> Result<Hop<HttpBody>, String> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(REQUEST_TIMEOUT)
            .read_timeout(DOWNLOAD_READ_TIMEOUT)
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(url)
            .header(reqwest::header::USER_AGENT, USER_AGENT)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        Ok(Hop {
            status: response.status().as_u16(),
            location,
            body: HttpBody(response),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn release(tag: &str) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "tag_name": tag,
            "html_url": format!("https://github.com/SouthCarpet/pdf-editor/releases/tag/{tag}"),
            "prerelease": false,
            "draft": false,
        }))
        .unwrap()
    }

    fn run<F: Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future)
    }

    #[test]
    fn consent_off_never_calls_the_transport() {
        let calls = Cell::new(0);

        let result = run(check_with(false, "0.1.0", |_url| {
            calls.set(calls.get() + 1);
            async { Ok((200, release("v9.9.9"))) }
        }));

        assert_eq!(calls.get(), 0);
        assert_eq!(result.status, UpdateStatus::Disabled);
    }

    #[test]
    fn consent_on_calls_the_github_latest_release_url_once() {
        let urls = std::cell::RefCell::new(Vec::new());

        run(check_with(true, "0.1.0", |url| {
            urls.borrow_mut().push(url);
            async { Ok((200, release("v0.1.0"))) }
        }));

        assert_eq!(
            urls.into_inner(),
            vec!["https://api.github.com/repos/SouthCarpet/pdf-editor/releases/latest".to_owned()]
        );
    }

    #[test]
    fn offline_is_a_connection_error_not_up_to_date() {
        let result = run(check_with(true, "0.1.0", |_url| async {
            Err("dns error: no such host".to_owned())
        }));

        assert_eq!(result.status, UpdateStatus::ConnectionError);
        assert_eq!(result.detail.as_deref(), Some("dns error: no such host"));
    }

    #[test]
    fn http_403_is_a_response_error_with_the_status() {
        let result = evaluate("0.1.0", 403, b"{\"message\":\"rate limit\"}");

        assert_eq!(result.status, UpdateStatus::ResponseError);
        assert_eq!(result.detail.as_deref(), Some("GitHub answered HTTP 403"));
    }

    #[test]
    fn bad_json_is_a_response_error() {
        let result = evaluate("0.1.0", 200, b"<html>");

        assert_eq!(result.status, UpdateStatus::ResponseError);
    }

    #[test]
    fn same_version_is_up_to_date() {
        let result = evaluate("1.1.0", 200, &release("v1.1.0"));

        assert_eq!(result.status, UpdateStatus::UpToDate);
        assert_eq!(result.latest_version.as_deref(), Some("1.1.0"));
    }

    #[test]
    fn older_release_is_up_to_date() {
        let result = evaluate("1.1.0", 200, &release("v1.0.9"));

        assert_eq!(result.status, UpdateStatus::UpToDate);
    }

    #[test]
    fn newer_release_is_available_with_its_page() {
        let result = evaluate("0.1.0", 200, &release("v1.1.0"));

        assert_eq!(result.status, UpdateStatus::Available);
        assert_eq!(result.latest_version.as_deref(), Some("1.1.0"));
        assert_eq!(
            result.release_url.as_deref(),
            Some("https://github.com/SouthCarpet/pdf-editor/releases/tag/v1.1.0")
        );
    }

    // Oracle: E1 item 16, a running 1.0.0 must be offered release 1.1.0.
    #[test]
    fn version_1_1_0_is_newer_than_running_1_0_0() {
        let result = evaluate("1.0.0", 200, &release("v1.1.0"));
        assert_eq!(result.status, UpdateStatus::Available);
        assert_eq!(result.latest_version.as_deref(), Some("1.1.0"));
    }

    #[test]
    fn available_release_carries_its_tag_for_the_update() {
        let result = evaluate("0.1.0", 200, &release("v1.1.0"));

        assert_eq!(result.tag.as_deref(), Some("v1.1.0"));
    }

    #[test]
    fn release_assets_are_read_with_name_url_and_size() {
        let body = serde_json::to_vec(&serde_json::json!({
            "tag_name": "v1.1.0",
            "assets": [{
                "name": "pdf-editor-setup-1.1.0.exe",
                "browser_download_url": "https://github.com/x/pdf-editor-setup-1.1.0.exe",
                "size": 147479859,
                "content_type": "application/x-msdownload",
            }],
        }))
        .unwrap();

        let release = parse_stable_release(200, &body).expect("stable release");

        assert_eq!(release.version, (1, 1, 0));
        assert_eq!(
            release.assets,
            vec![ReleaseAsset {
                name: "pdf-editor-setup-1.1.0.exe".into(),
                browser_download_url: "https://github.com/x/pdf-editor-setup-1.1.0.exe".into(),
                size: 147479859,
            }]
        );
    }

    #[test]
    fn tag_without_v_is_accepted() {
        let result = evaluate("0.1.0", 200, &release("1.1.0"));

        assert_eq!(result.status, UpdateStatus::Available);
    }

    #[test]
    fn version_parts_compare_as_numbers_not_text() {
        let result = evaluate("0.9.0", 200, &release("v0.10.0"));

        assert_eq!(result.status, UpdateStatus::Available);
    }

    #[test]
    fn prerelease_tag_is_not_offered() {
        let result = evaluate("0.1.0", 200, &release("v1.1.0-rc1"));

        assert_eq!(result.status, UpdateStatus::ResponseError);
        assert_eq!(result.latest_version, None);
    }

    #[test]
    fn release_flagged_prerelease_is_not_offered() {
        let body = serde_json::to_vec(&serde_json::json!({
            "tag_name": "v1.1.0", "html_url": "u", "prerelease": true,
        }))
        .unwrap();

        let result = evaluate("0.1.0", 200, &body);

        assert_eq!(result.status, UpdateStatus::ResponseError);
    }

    #[test]
    fn stable_version_rejects_two_or_four_parts() {
        assert_eq!(stable_version("1.1"), None);
        assert_eq!(stable_version("1.1.0.1"), None);
        assert_eq!(stable_version("V2.0.1"), Some((2, 0, 1)));
    }
}
