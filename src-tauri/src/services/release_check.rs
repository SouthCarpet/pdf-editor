//! Opt-in check for a newer stable release on GitHub (plan 119).
//!
//! This is the only module that makes a network request, and it makes one
//! unauthenticated GET to `RELEASES_URL`, only when the stored consent
//! `update_check_enabled` is on. `scripts/test-privacy.ps1` fails the build
//! when `reqwest` appears in any other source file.
//!
//! Nothing here downloads or starts an installer. Every failure comes back
//! as a status the caller can show; nothing panics or opens a dialog.
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::time::Duration;

pub const RELEASES_URL: &str =
    "https://api.github.com/repos/SouthCarpet/pdf-editor/releases/latest";
const USER_AGENT: &str = concat!("pdf-editor/", env!("CARGO_PKG_VERSION"));
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
/// A larger response is a transport failure, never buffered without limit.
const MAX_BODY_BYTES: usize = 1024 * 1024;

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

/// Turns one GitHub response into a status.
pub fn evaluate(current: &str, status: u16, body: &[u8]) -> UpdateCheck {
    if !(200..300).contains(&status) {
        return response_error(current, format!("GitHub answered HTTP {status}"));
    }
    let Ok(release) = serde_json::from_slice::<GithubRelease>(body) else {
        return response_error(current, "GitHub sent a response that is not release JSON");
    };
    let tag = release.tag_name.unwrap_or_default();
    let stable = stable_version(&tag).filter(|_| !release.prerelease && !release.draft);
    let Some(latest) = stable else {
        return response_error(
            current,
            format!("latest release tag \"{tag}\" is not a stable vX.Y.Z"),
        );
    };
    let newer = stable_version(current).is_some_and(|running| latest > running);
    UpdateCheck {
        latest_version: Some(format!("{}.{}.{}", latest.0, latest.1, latest.2)),
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
