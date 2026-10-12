use super::*;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tempfile::TempDir;

const TAG: &str = "v1.2.0";
const SETUP: &str = "pdf-editor-setup-1.2.0.exe";
const SETUP_URL: &str =
    "https://github.com/SouthCarpet/pdf-editor/releases/download/v1.2.0/pdf-editor-setup-1.2.0.exe";
const SETUP_CDN: &str = "https://release-assets.githubusercontent.com/setup";
const SUMS_URL: &str =
    "https://github.com/SouthCarpet/pdf-editor/releases/download/v1.2.0/SHA256SUMS.txt";
const SETUP_BYTES: &[u8] = b"pretend this is an Inno setup";

#[derive(Clone)]
enum Reply {
    Chunks(Vec<Result<Vec<u8>, String>>),
    Redirect(String),
    Status(u16),
}

#[derive(Default)]
struct FakeTransport {
    replies: HashMap<String, Reply>,
    requested: Mutex<Vec<String>>,
}

struct FakeBody(VecDeque<Result<Vec<u8>, String>>);

impl BodyStream for FakeBody {
    async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, String> {
        self.0.pop_front().transpose()
    }
}

impl Download for FakeTransport {
    type Body = FakeBody;

    async fn get(&self, url: &str) -> Result<Hop<FakeBody>, String> {
        self.requested.lock().unwrap().push(url.to_owned());
        let hop = |status, location, chunks: Vec<_>| Hop {
            status,
            location,
            body: FakeBody(chunks.into()),
        };
        match self.replies.get(url).cloned() {
            Some(Reply::Chunks(chunks)) => Ok(hop(200, None, chunks)),
            Some(Reply::Redirect(to)) => Ok(hop(302, Some(to), Vec::new())),
            Some(Reply::Status(status)) => Ok(hop(status, None, Vec::new())),
            None => Err(format!("connection refused: {url}")),
        }
    }
}

impl FakeTransport {
    fn reply(mut self, url: &str, reply: Reply) -> Self {
        self.replies.insert(url.to_owned(), reply);
        self
    }

    fn requests(&self) -> Vec<String> {
        self.requested.lock().unwrap().clone()
    }

    /// The release assets as GitHub serves them: the download URL
    /// redirects to the release-assets host.
    fn github(setup: &[u8], sums: &str) -> Self {
        Self::default()
            .reply(SETUP_URL, Reply::Redirect(SETUP_CDN.into()))
            .reply(SETUP_CDN, Reply::Chunks(chunks(setup)))
            .reply(SUMS_URL, Reply::Chunks(vec![Ok(sums.as_bytes().to_vec())]))
    }
}

fn chunks(bytes: &[u8]) -> Vec<Result<Vec<u8>, String>> {
    bytes.chunks(7).map(|c| Ok(c.to_vec())).collect()
}

fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn sums_line(bytes: &[u8]) -> String {
    format!("{}  {SETUP}\n", sha(bytes))
}

fn release_json(tag: &str, setup_name: &str, size: u64) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "tag_name": tag,
        "html_url": format!("https://github.com/SouthCarpet/pdf-editor/releases/tag/{tag}"),
        "assets": [
            { "name": setup_name, "browser_download_url": SETUP_URL, "size": size },
            { "name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL, "size": 95 },
        ],
    }))
    .unwrap()
}

fn latest(
    body: Vec<u8>,
) -> impl FnOnce(String) -> std::future::Ready<Result<(u16, Vec<u8>), String>> {
    move |_url| std::future::ready(Ok((200, body)))
}

fn real_file(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::File::create(path)
}

async fn download(
    transport: &FakeTransport,
    release: Vec<u8>,
    dir: &TempDir,
) -> Result<VerifiedSetup, Failure> {
    download_update_with(true, TAG, dir.path(), latest(release), transport, real_file).await
}

fn files_in(dir: &TempDir) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir.path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

fn status(result: Result<VerifiedSetup, Failure>) -> UpdateInstallStatus {
    result.expect_err("the download must be refused").status
}

#[tokio::test]
async fn verified_setup_is_saved_under_its_release_name() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES));

    let setup = download(
        &transport,
        release_json(TAG, SETUP, SETUP_BYTES.len() as u64),
        &dir,
    )
    .await
    .expect("verified setup");

    assert_eq!(setup.path, dir.path().join(SETUP));
    assert_eq!(setup.sha256, sha(SETUP_BYTES));
    assert_eq!(setup.version, "1.2.0");
    assert_eq!(std::fs::read(&setup.path).unwrap(), SETUP_BYTES);
    assert_eq!(files_in(&dir), vec![SETUP.to_owned()]);
    assert_eq!(transport.requests(), vec![SUMS_URL, SETUP_URL, SETUP_CDN]);
}

#[tokio::test]
async fn consent_off_sends_nothing() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES));
    let fetched = std::cell::Cell::new(false);

    let result = download_update_with(
        false,
        TAG,
        dir.path(),
        |_url| {
            fetched.set(true);
            std::future::ready(Ok((200, Vec::new())))
        },
        &transport,
        real_file,
    )
    .await;

    assert_eq!(status(result), UpdateInstallStatus::Disabled);
    assert!(!fetched.get());
    assert!(transport.requests().is_empty());
}

#[tokio::test]
async fn changed_tag_is_refused_before_any_download() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES));
    let newer = release_json("v1.3.0", "pdf-editor-setup-1.3.0.exe", 29);

    let result = download(&transport, newer, &dir).await;

    assert_eq!(status(result), UpdateInstallStatus::ReleaseChanged);
    assert!(transport.requests().is_empty());
}

#[tokio::test]
async fn wrong_hash_is_refused_and_leaves_no_file() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(b"a different setup"));

    let result = download(
        &transport,
        release_json(TAG, SETUP, SETUP_BYTES.len() as u64),
        &dir,
    )
    .await;

    assert_eq!(status(result), UpdateInstallStatus::ChecksumMismatch);
    assert!(files_in(&dir).is_empty());
}

#[tokio::test]
async fn interrupted_download_is_refused_and_leaves_no_file() {
    let dir = TempDir::new().unwrap();
    let mut broken = chunks(&SETUP_BYTES[..14]);
    broken.push(Err("connection reset".into()));
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES))
        .reply(SETUP_CDN, Reply::Chunks(broken));

    let result = download(
        &transport,
        release_json(TAG, SETUP, SETUP_BYTES.len() as u64),
        &dir,
    )
    .await;

    let failure = result.unwrap_err();
    assert_eq!(failure.status, UpdateInstallStatus::DownloadFailed);
    assert_eq!(failure.detail, "download interrupted: connection reset");
    assert!(files_in(&dir).is_empty());
}

#[tokio::test]
async fn short_download_is_refused() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(&SETUP_BYTES[..10], &sums_line(SETUP_BYTES));

    let result = download(
        &transport,
        release_json(TAG, SETUP, SETUP_BYTES.len() as u64),
        &dir,
    )
    .await;

    let failure = result.unwrap_err();
    assert_eq!(failure.status, UpdateInstallStatus::DownloadFailed);
    assert_eq!(failure.detail, "download incomplete: 10 of 29 bytes");
    assert!(files_in(&dir).is_empty());
}

/// A file that accepts `room` bytes, then fails like a full disk.
struct FullDisk {
    file: std::fs::File,
    room: usize,
}

impl Write for FullDisk {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if buf.len() > self.room {
            return Err(std::io::Error::new(
                std::io::ErrorKind::StorageFull,
                "There is not enough space on the disk.",
            ));
        }
        self.room -= buf.len();
        self.file.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.file.flush()
    }
}

#[tokio::test]
async fn full_disk_is_a_disk_error_and_removes_the_partial_file() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES));
    let create = |path: &Path| {
        Ok(FullDisk {
            file: std::fs::File::create(path)?,
            room: 10,
        })
    };

    let result = download_update_with(
        true,
        TAG,
        dir.path(),
        latest(release_json(TAG, SETUP, SETUP_BYTES.len() as u64)),
        &transport,
        create,
    )
    .await;

    let failure = result.unwrap_err();
    assert_eq!(failure.status, UpdateInstallStatus::DiskError);
    assert_eq!(failure.detail, "There is not enough space on the disk.");
    assert!(files_in(&dir).is_empty());
}

#[tokio::test]
async fn redirect_to_a_host_outside_the_list_is_never_requested() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES)).reply(
        SETUP_URL,
        Reply::Redirect("https://github.com.evil.example/setup".into()),
    );

    let result = download(
        &transport,
        release_json(TAG, SETUP, SETUP_BYTES.len() as u64),
        &dir,
    )
    .await;

    assert_eq!(status(result), UpdateInstallStatus::BlockedHost);
    assert_eq!(transport.requests(), vec![SUMS_URL, SETUP_URL]);
    assert!(files_in(&dir).is_empty());
}

#[tokio::test]
async fn metadata_size_over_the_cap_is_refused_before_any_download() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES));

    let result = download(
        &transport,
        release_json(TAG, SETUP, MAX_SETUP_BYTES + 1),
        &dir,
    )
    .await;

    assert_eq!(status(result), UpdateInstallStatus::TooLarge);
    assert!(transport.requests().is_empty());
}

#[tokio::test]
async fn more_bytes_than_the_metadata_size_are_refused() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES));

    let result = download(&transport, release_json(TAG, SETUP, 20), &dir).await;

    assert_eq!(status(result), UpdateInstallStatus::TooLarge);
    assert!(files_in(&dir).is_empty());
}

#[tokio::test]
async fn release_without_the_exact_setup_name_has_no_setup() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES));
    let msi_only = release_json(TAG, "pdf-editor_1.2.0_x64_en-US.msi", 29);

    let result = download(&transport, msi_only, &dir).await;

    assert_eq!(status(result), UpdateInstallStatus::NoSetup);
    assert!(transport.requests().is_empty());
}

#[tokio::test]
async fn sums_without_a_line_for_the_setup_name_are_refused() {
    let dir = TempDir::new().unwrap();
    let other_name = format!("{}  pdf-editor-setup-1.2.0.exe.old\n", sha(SETUP_BYTES));
    let transport = FakeTransport::github(SETUP_BYTES, &other_name);

    let result = download(
        &transport,
        release_json(TAG, SETUP, SETUP_BYTES.len() as u64),
        &dir,
    )
    .await;

    assert_eq!(status(result), UpdateInstallStatus::ChecksumMissing);
    assert_eq!(transport.requests(), vec![SUMS_URL]);
}

#[tokio::test]
async fn http_error_on_the_setup_is_a_download_failure() {
    let dir = TempDir::new().unwrap();
    let transport = FakeTransport::github(SETUP_BYTES, &sums_line(SETUP_BYTES))
        .reply(SETUP_CDN, Reply::Status(404));

    let result = download(
        &transport,
        release_json(TAG, SETUP, SETUP_BYTES.len() as u64),
        &dir,
    )
    .await;

    let failure = result.unwrap_err();
    assert_eq!(failure.status, UpdateInstallStatus::DownloadFailed);
    assert_eq!(failure.detail, format!("HTTP 404 for {SETUP_CDN}"));
}

fn verified(dir: &TempDir, bytes: &[u8]) -> VerifiedSetup {
    let path = dir.path().join(SETUP);
    std::fs::write(&path, bytes).unwrap();
    VerifiedSetup {
        path,
        sha256: sha(bytes),
        version: "1.2.0".into(),
    }
}

#[test]
fn setup_changed_after_the_check_never_starts() {
    let dir = TempDir::new().unwrap();
    let setup = verified(&dir, SETUP_BYTES);
    std::fs::write(&setup.path, b"swapped after the check").unwrap();
    let started = std::cell::Cell::new(0);

    let result = start_verified(&setup, &|_path| {
        started.set(started.get() + 1);
        Ok(())
    });

    assert_eq!(result.unwrap_err().status, UpdateInstallStatus::FileChanged);
    assert_eq!(started.get(), 0);
}

#[test]
fn unchanged_setup_starts_once_with_its_path() {
    let dir = TempDir::new().unwrap();
    let setup = verified(&dir, SETUP_BYTES);
    let started = std::cell::RefCell::new(Vec::new());

    start_verified(&setup, &|path| {
        started.borrow_mut().push(path.to_path_buf());
        Ok(())
    })
    .expect("start");

    assert_eq!(started.into_inner(), vec![setup.path.clone()]);
}

#[test]
fn a_runner_error_is_start_failed() {
    let dir = TempDir::new().unwrap();
    let setup = verified(&dir, SETUP_BYTES);

    let result = start_verified(&setup, &|_path| {
        Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "blocked",
        ))
    });

    assert_eq!(result.unwrap_err().status, UpdateInstallStatus::StartFailed);
}

#[test]
fn only_https_on_the_four_github_hosts_is_allowed() {
    let allowed = [
        "https://api.github.com/repos/SouthCarpet/pdf-editor/releases/latest",
        "https://github.com/SouthCarpet/pdf-editor/releases/download/v1.2.0/x.exe",
        "https://objects.githubusercontent.com/a?b=c",
        "https://release-assets.githubusercontent.com/a",
        "https://GitHub.com/x",
    ];
    let refused = [
        "http://github.com/x",
        "https://github.com.evil.example/x",
        "https://evil.example/github.com",
        "https://user@github.com/x",
        "https://github.com:8443/x",
        "https://githubusercontent.com/x",
        "file:///C:/setup.exe",
        "/relative/path",
    ];

    for url in allowed {
        assert!(is_allowed_url(url), "{url} must be allowed");
    }
    for url in refused {
        assert!(!is_allowed_url(url), "{url} must be refused");
    }
}

#[test]
fn checksum_line_matches_the_exact_file_name_only() {
    let hash = "A".repeat(64);
    let sums = format!(
        "{h}  pdf-editor-setup-1.2.0.exe.old\n{h} *pdf-editor-setup-1.2.0.exe\nnot-a-hash  other.exe\n",
        h = hash
    );

    assert_eq!(checksum_for(&sums, SETUP), Some("a".repeat(64)));
    assert_eq!(checksum_for(&sums, "pdf-editor-setup-1.2.exe"), None);
    assert_eq!(
        checksum_for("short  pdf-editor-setup-1.2.0.exe", SETUP),
        None
    );
}
